exports.get = function(request, response) {
    response.send(statusCodes.OK, { message : 'Hello World!' });
};

function getUserAppSyncId(request, options) {
    var table = request.service.tables.getTable("AppSyncUsers");
    table.where({userEmail : options.email })
        .read({
            success: function (results) {
                console.log('%j', results);
                if(!results.length) {
                    //Insert new user with a new appSyncId GUID
                    var buffer = new Buffer(16);
                    var syncIdBytes = uuid.v4({rng: uuid.nodeRNG}, buffer, 0);
                    var syncId = uuid.unparse(syncIdBytes);
                    console.log("syncId: {%s}", syncId);
                    var record = {
                        appSyncId: syncId,
                        userId: request.user.userId,
                        userEmail: options.email,
                        isSyncOwner: true,
                        editDateTime: new Date()
                    };
                    console.log("record: %j", record);
                    table.insert(record, {
                         success: function () {
                             console.log("Inserted %s into AppSyncUsers with appSyncId {%s}", [options.email, record.appSyncId]);
                             options.success(record.appSyncId);
                         },
                         error: function (error) {
                             console.log("Error inserting %s into AppSyncUsers with appSyncId {%s}\n\n%s", [options.email, record.appSyncId, error.message]);
                             options.error(error);
                         }
                     });
                } else {
                    console.log("User %s exists with appSyncId {%s}", [options.email, results[0].appSyncId]);
                    options.success(results[0].appSyncId);
                }
            },
            error: function (error) {
                console.log("Error retrieving user record %s from AppSyncUsers\n\n%s", [options.email, error.message]);
                options.error(error);
            }
        });
}
