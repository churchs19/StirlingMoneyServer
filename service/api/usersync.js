exports.get = function(request, response) {
    var table = request.service.tables.getTable("AppSyncUsers");
    table.where({userId : request.user.userId })
        .read({
            success: function (results) {
                console.log('%j', results);
                response.send(statusCodes.OK, { userSyncExists: results.length>0 });
            },
            error: function (error) {
                console.log("Error retrieving user record %s from AppSyncUsers\n\n%s", request.user.userId, error.message);
                response.send(statusCodes.INTERNAL_SERVER_ERROR)
            }
        });    
};