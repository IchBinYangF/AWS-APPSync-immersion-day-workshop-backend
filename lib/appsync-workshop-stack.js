// 1. Import dependencies
const cdk = require("aws-cdk-lib");
const appsync = require("aws-cdk-lib/aws-appsync");
const db = require("aws-cdk-lib/aws-dynamodb");
const cognito = require("aws-cdk-lib/aws-cognito");

// 2. No API key

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
      },
    });

    // 4. Define the DynamoDB table with partition key and sort key
    const table = new db.Table(this, "DataPointTable", {
      partitionKey: { name: "name", type: db.AttributeType.STRING },
      sortKey: { name: "createdAt", type: db.AttributeType.STRING },
    });

    // 5. Set up table as a Datasource and grant access
    const dataSource = api.addDynamoDbDataSource("dataPointSource", table);

    // 6. Define resolvers
    const createDataPointFunction = dataSource.createFunction(
      "CreateDataPointFunction",
      {
        name: "CreateDataPointFunction",
        code: appsync.Code.fromAsset(
          "appsync/resolvers/mutationCreateDataPoint.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    const queryDataPointsDateTimeFunction = dataSource.createFunction(
      "QueryDataPointsDateTimeFunction",
      {
        name: "QueryDataPointsDateTimeFunction",
        api,
        dataSource: dataSource,
        code: appsync.Code.fromAsset(
          "appsync/resolvers/queryDataPointsByNameAndDateTime.js"
        ),
        runtime: appsync.FunctionRuntime.JS_1_0_0,
      }
    );

    const pipelineReqResCode = appsync.Code.fromInline(`
    export function request(ctx) {
      return {}
    }

    export function response(ctx) {
      return ctx.prev.result
    }
`);

    api.createResolver("CreateDataPointPipelineResolver", {
      typeName: "Mutation",
      fieldName: "createDataPoint",
      code: pipelineReqResCode,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [createDataPointFunction],
    });

    api.createResolver("QueryNameDateTimePipelineResolver", {
      typeName: "Query",
      fieldName: "queryDataPointsByNameAndDateTime",
      code: pipelineReqResCode,
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      pipelineConfig: [queryDataPointsDateTimeFunction],
    });

    // 7. Stack Outputs
    new cdk.CfnOutput(this, "GraphQLAPI_ID", { value: api.apiId });
    new cdk.CfnOutput(this, "GraphQLAPI_URL", { value: api.graphqlUrl });
    new cdk.CfnOutput(this, "STACK_REGION", { value: this.region });
    // 7.a. User Pool information
    new cdk.CfnOutput(this, "USER_POOLS_ID", { value: pool.userPoolId });
    new cdk.CfnOutput(this, "USER_POOLS_WEB_CLIENT_ID", {
      value: client.userPoolClientId,
    });
  }
}

module.exports = { AppsyncWorkshopStack };
