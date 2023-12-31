// 1. Import dependencies
const cdk = require("aws-cdk-lib");
const appsync = require("aws-cdk-lib/aws-appsync");
const db = require("aws-cdk-lib/aws-dynamodb");
const cognito = require("aws-cdk-lib/aws-cognito");
const lambda = require('aws-cdk-lib/aws-lambda')

const { WafConfig } = require("./wafConfig");

// 2. Reintroduce: setup a static expiration date for the API KEY
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const WORKSHOP_DATE = new Date(); // date of this workshop
WORKSHOP_DATE.setHours(0);
WORKSHOP_DATE.setMinutes(0);
WORKSHOP_DATE.setSeconds(0);
WORKSHOP_DATE.setMilliseconds(0);
const KEY_EXPIRATION_DATE = new Date(WORKSHOP_DATE.getTime() + SEVEN_DAYS);

class AppsyncWorkshopStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // 2.a. Configure the User Pool
    const pool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "WorkshopUserPool",
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true } },
    });
    // 2.b. Configure the client
    const client = pool.addClient("customer-app-client-web", {
      preventUserExistenceErrors: true,
    });

    // 3. Define your AppSync API
    const api = new appsync.GraphqlApi(this, "WorkshopAPI", {
      name: "WorkshopAPI",
      // 3. a. create schema using our schema definition
      schema: appsync.SchemaFile.fromAsset("appsync/schema.graphql"),
      // 3. b. Authorization mode
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool: pool,
          },
        },
        // 3. c. Additional Authorization mode
        additionalAuthorizationModes: [
          {
            authorizationType: "API_KEY",
            apiKeyConfig: {
              name: "default",
              description: "default auth mode",
              expires: cdk.Expiration.atDate(KEY_EXPIRATION_DATE),
            },
          },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        excludeVerboseContent: false,
        fieldLogLevel: appsync.FieldLogLevel.ALL
      }
    });

    // 4.a Define the DynamoDB table with partition key and sort key
    const table = new db.Table(this, "GenericDataPointTable", {
      partitionKey: { name: "PK", type: db.AttributeType.STRING },
      sortKey: { name: "SK", type: db.AttributeType.STRING },
    });

    // 4.b. Define a Lambda function, passing the table name as an env variable
    const queryHandler = new lambda.Function(this, 'QueryDataHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('lambda/listDataPoints'),
      handler: 'index.handler',
      environment: {
        TABLE: table.tableName,
      },
    })
    table.grantReadData(queryHandler)

    const customAuthorizer = new lambda.Function(this, 'CustomAuthorizer', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('lambda/customAuthorizer'),
      handler: 'index.handler',
      environment: { ALLOW: 'true' },
    })

    // 5. Set up table as a Datasource and grant access
    const dataSource = api.addDynamoDbDataSource("dataPointSource", table);

    // 6. Define resolvers
    const queryDataPointsDateTimeFunction = dataSource.createFunction(
      "QueryDataPointsDateTimeFunction",
      {
        name: "QueryDataPointsDateTimeFunction",
        code: appsync.Code.fromAsset(
          "appsync/resolvers/queryDataPointsByNameAndDateTime.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    // const listDataPointFunction = dataSource.createFunction(
    //   "ListDataPointFunction",
    //   {
    //     name: "ListDataPointFunction",
    //     code: appsync.Code.fromAsset(
    //       "appsync/resolvers/Query.listDataPoints.js"
    //     ),
    //     runtime: appsync.FunctionRuntime.JS_1_0_0,
    //   }
    // );

    const pipelineReqResCode = appsync.Code.fromInline(`
    export function request(ctx) {
      return {}
    }

    export function response(ctx) {
      return ctx.prev.result
    }
    `);


    api.createResolver("QueryNameDateTimePipelineResolver", {
      typeName: "Query",
      fieldName: "queryDataPointsByNameAndDateTime",
      code: appsync.Code.fromAsset(
        "appsync/resolvers/Query.queryDataPointsByNameAndDateTime.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [queryDataPointsDateTimeFunction],
    });

    const lambdaSource = api.addLambdaDataSource(
      'lambdaQuerySource',
      queryHandler
    )

    const customAuthSource = api.addLambdaDataSource(
      'customAuthSource',
      customAuthorizer
    )
    
    lambdaSource.createResolver('ListDataPoints',{
      typeName: 'Query',
      fieldName: 'listDataPoints',
    })

    const f1 = customAuthSource.createFunction('f1', {
      name: 'userChecker',
      code: appsync.Code.fromInline(`
        import { util } from '@aws-appsync/utils';
    
        export function request(ctx) {
            return {
                "version" : "2017-02-28",
                "operation": "Invoke",
                "payload": ctx.args
            };
        }
    
        export function response(ctx) {
            if (!ctx.result.allow) {
                util.unauthorized();
            }
            return {};
        }
      `),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })
    
    const f2 = dataSource.createFunction('CreateDataPointFunction', {
      name: 'CreateDataPointFunction',
      code: appsync.Code.fromAsset('appsync/resolvers/mutationCreateDataPoint.js'),
      runtime: appsync.FunctionRuntime.JS_1_0_0
    })

    api.createResolver('createDataPointPipeline', {
      typeName: 'Mutation',
      fieldName: 'createDataPoint',
      code: pipelineReqResCode,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [f1, f2]
    })

    // api.createResolver("ListDataPointResolver", {
    //   typeName: "Query",
    //   fieldName: "listDataPoints",
    //   code: pipelineReqResCode,
    //   runtime: appsync.FunctionRuntime.JS_1_0_0,
    //   pipelineConfig: [listDataPointFunction],
    // });

    const noneDataSource = api.addNoneDataSource("none");
    const subscriptionOnCreateDataPoint = noneDataSource.createFunction(
      "SubscriptionOnCreateDataPoint",
      {
        name: "SubscriptionOnCreateDataPoint",
        code: pipelineReqResCode,
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    api.createResolver("OnCreateDataPoint", {
      typeName: "Subscription",
      fieldName: "onCreateDataPoint",
      code: appsync.Code.fromAsset(
        "appsync/resolvers/Subscription.onCreateDataPoint.js"
      ),
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [subscriptionOnCreateDataPoint],
    });

    const wafConfig = new WafConfig(this, "WorkshopAPI-Waf", { api });

    // 7. Stack Outputs
    new cdk.CfnOutput(this, "GraphQLAPI_ID", { value: api.apiId });
    new cdk.CfnOutput(this, "GraphQLAPI_URL", { value: api.graphqlUrl });
    new cdk.CfnOutput(this, "GraphQLAPI_KEY", { value: api.apiKey });
    new cdk.CfnOutput(this, "STACK_REGION", { value: this.region });
    // 7.a. User Pool information
    new cdk.CfnOutput(this, "USER_POOLS_ID", { value: pool.userPoolId });
    new cdk.CfnOutput(this, "USER_POOLS_WEB_CLIENT_ID", {
      value: client.userPoolClientId,
    });
    // 7.b. WAF information
    new cdk.CfnOutput(this, "ACLRef", { value: wafConfig.acl.ref });
    new cdk.CfnOutput(this, "ACLAPIAssoc", {
      value: wafConfig.association.ref,
    });
  }
}

module.exports = { AppsyncWorkshopStack };
