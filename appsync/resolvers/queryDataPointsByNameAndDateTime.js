import { util } from '@aws-appsync/utils';

export function request(ctx) {
    let owner = ctx.identity.claims["username"]
    if (owner === null){
      owner = ctx.identity.claims["cognito:username"]
    }
    let scanIndexFwd = true
    if(ctx.args.sortDirection && ctx.args.sortDirection == "DESC"){
        scanIndexFwd = false
    }
    let filter = ctx.args.filter
    if(ctx.args.filter){
      filter = JSON.parse(util.transform.toDynamoDBFilterExpression(ctx.args.filter)) 
    }
    const expression = getExpression(ctx.args.createdAt, ctx.args.name, owner)
    return {
        operation: 'Query',
        query: {
          expression: expression?.comparison_str,
          expressionNames: expression?.expressionNames,
          expressionValues: expression?.expressionValues  },
        limit: ctx.args.limit,
        filter: filter,
        nextToken: ctx.args.nextToken,
        scanIndexForward: scanIndexFwd,
    };
}

function getExpression(createdAt, name, owner){
  let comparison_str = '#PK = :PK'
  let expressionNames = { "#PK": "PK"}
  let expressionValues = {
    ':PK': { "S": owner+"#"+name },
  }

  if(createdAt){       
    if(createdAt.beginsWith){
      comparison_str += ' and begins_with(#sortKey, :sortKey)'
      expressionNames["#sortKey"] = "SK"
      expressionValues[':sortKey'] = {"S": createdAt.beginsWith}
      
    }
    else if(createdAt.eq){
      comparison_str += ' and #sortKey = :sortKey'
      expressionNames["#sortKey"] = "SK"
      expressionValues[':sortKey'] = {"S": createdAt.eq}
    }
    else if(createdAt.lt){
      comparison_str += ' and #sortKey < :sortKey'
      expressionNames["#sortKey"] = "SK"
      expressionValues[':sortKey'] = {"S": createdAt.lt}
    }
    else if(createdAt.le){
      comparison_str += ' and #sortKey <= :sortKey'
      expressionNames["#sortKey"] = "SK"
      expressionValues[':sortKey'] = {"S": createdAt.le}
    }
    else if(createdAt.gt){
      comparison_str += ' and #sortKey > :sortKey'
      expressionNames["#sortKey"] = "SK"
      expressionValues[':sortKey'] = {"S": createdAt.gt}
    }
    else if(createdAt.ge){
      comparison_str += ' and #sortKey >= :sortKey'
      expressionNames["#sortKey"] = "SK"
      expressionValues[':sortKey'] = {"S": createdAt.ge}
    }
    else if(createdAt.between){
        comparison_str += ' and #sortKey BETWEEN :sortKey0 AND :sortKey1'
        expressionNames["#sortKey"] = "SK"
        expressionValues[':sortKey0'] = {"S": createdAt.between[0]}
        expressionValues[':sortKey1'] = {"S": createdAt.between[1]}       
    }   
  }
  return {comparison_str, expressionValues, expressionNames}
}

export function response(ctx) {
  const { error, result } = ctx;
  if (error) {
    return util.appendError(error.message, error.type, result);
  }
  return result;
}
