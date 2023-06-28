import { util } from '@aws-appsync/utils';

export function request(ctx) {
    const { input: values } = ctx.arguments;
    let owner = ctx.identity.claims["username"]
    if (owner === null){
        owner = ctx.identity.claims["cognito:username"]
    }
    values.owner = owner
    if (values.createdAt === null ){
        values.createdAt = util.time.nowISO8601()
    }
    const key = {
        PK: owner+'#'+values.name,
        SK: values.createdAt
    };
    
    if (values.value === null) {
        values.value = 0
    }
    
    const condition = {
        PK: { attributeExists: false },
        SK: { attributeExists: false }
    };
    
    return {
        operation: 'PutItem',
        key: util.dynamodb.toMapValues(key),
        attributeValues: util.dynamodb.toMapValues(values),
        condition:getCondition(condition)
    };
}

// Source: https://github.com/aws-samples/aws-appsync-resolver-samples/blob/main/templates/functions/dynamodb/createItem.js
function getCondition(inCondObj) {
    if (!inCondObj) return null;
    const condition = JSON.parse(util.transform.toDynamoDBConditionExpression(inCondObj));
    if (condition && condition.expressionValues && !Object.keys(condition.expressionValues).length) {
        delete condition.expressionValues;
    }
    return condition;
}

export function response(ctx) {
    const { error, result } = ctx;
    if (error) {
        return util.appendError(error.message, error.type, result);
    }
    return ctx.result;
}
