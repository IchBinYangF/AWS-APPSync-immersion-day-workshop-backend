import { util } from '@aws-appsync/utils';

export function request(ctx) {
    return ctx.result;
}

export function response(ctx) {
    let isOwnerAuthorized = false
    let allowedOwner = ctx.args.owner
    let identityValue = ctx.identity.claims["username"]
    //checks that the owner matches the caller's username.
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
