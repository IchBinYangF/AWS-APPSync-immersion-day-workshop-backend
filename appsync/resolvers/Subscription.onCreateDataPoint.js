import { util } from '@aws-appsync/utils';

export function request(ctx) {
    return ctx.result;
}
//allow users to only read/write their own data.
export function response(ctx) {
    let isOwnerAuthorized = false
    let allowedOwner = ctx.args.owner
    let identityValue = ctx.identity.claims["username"]
    if(identityValue === null){
        identityValue = ctx.identity.claims["cognito:username"]
    }
    if(allowedOwner == identityValue){
        isOwnerAuthorized = true
    }
    if(!isOwnerAuthorized){
        util.unauthorized()
    }
    return null
}
