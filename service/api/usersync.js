exports.get = function(request, response) {
    var table = request.service.tables.getTable("AppSyncUsers");
    table.where({userEmail : options.email })
        .read({
            success: function (results) {
                console.log('%j', results);
                if(!results.length) {
                } else {
                }
            },
            error: function (error) {
                console.log("Error retrieving user record %s from AppSyncUsers\n\n%s", [options.email, error.message]);
                options.error(error);
            }
        });    
};

function getUserAppSyncId(request, options) {
}
