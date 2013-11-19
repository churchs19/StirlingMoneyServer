var Enumerable = require("linq");
var uuid = require("node-uuid");

exports.post = function (request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    try {
        console.log("%s: /sync POST with request '%j' by user %s", new Date(), request.body, request.user);
        var body = request.body, count = 0, results = [];
        if (!body.lastSyncDate ||
                !body.items ||
                !body.email) {
            console.error("%s: Invalid request body: %j", new Date(), request.body);
            response.send(statusCodes.BAD_REQUEST, {message: "Invalid request body"});
            return;
        }

        getUserAppSyncId(request, {
            email: body.email,
            success: function (appSyncId) {
                body.items.forEach(function (item) {
                    var options = {
                        tableName: item.tableName,
                        idField: item.keyField,
                        user: request.user,
                        appSyncId: appSyncId,
                        values: item.values,
                        lastSyncDate: body.lastSyncDate,
                        success: function (serverChanges) {
                            results.push(serverChanges);
                            count = count + 1;
                            if (count === body.items.length) {
                                response.send(statusCodes.OK, results);
                            }
                        },
                        error: function (error, statusCode) {
                            console.error("%s: Error occurred processing request '%j' from user '%j':\n\n" + error, new Date(), request.body, request.user);
                            if (!statusCode) {
                                throw { statusCode: statusCodes.INTERNAL_SERVER_ERROR, error: error };
                            } else {
                                throw { statusCode: statusCode, error: error };
                            }
                        }
                    };
                    processClientChanges(options, request);
                });
            },
            error: function (error) {
                throw { statusCode: statusCodes.INTERNAL_SERVER_ERROR, error: error };
            }
        });
    } catch (e) {
        if (e.statusCode) {
            console.error("%s: %s : %s", new Date(), e.StatusCode , e.error);
            response.send(e.statusCode, {message:e.error});
        } else {
            console.error("%s: Unhandled Exception: " + e, new Date());
            response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : e});
        }
    }
};

function getUserAppSyncId(request, options) {
    var table = request.service.tables.getTable("AppSyncUsers");
    table.where({userEmail : options.email })
        .read({
            success: function (results) {
//                console.log('%j', results);
                if(results.length === 0) {
                    //Insert new user with a new appSyncId GUID
                    var buffer = new Buffer(16);
                    var syncIdBytes = uuid.v4({rng: uuid.nodeRNG}, buffer, 0);
                    var syncId = uuid.unparse(syncIdBytes);
//                    console.log("syncId: {%s}", syncId);
                    var record = {
                        appSyncId: syncId,
                        userId: request.user.userId,
                        userEmail: options.email,
                        isSyncOwner: true,
                        editDateTime: new Date()
                    };
//                    console.log("record: %j", record);
                    table.insert(record, {
                         success: function () {
                             console.log("%s: Inserted %s into AppSyncUsers with appSyncId {%s}", new Date(), options.email, record.appSyncId);
                             options.success(record.appSyncId);
                             return;
                         },
                         error: function (error) {
                             console.log("%s: Error inserting %s into AppSyncUsers with appSyncId {%s}\n\n%s", new Date(), options.email, record.appSyncId, error.message);
                             throw error;
                         }
                     });
                } else {
                    if(!results[0].userId) {
                        results[0].userId = request.user.userId;
                        table.update(results[0], {
                           success: function() {
//                                console.log("Updated userId for %s with appSyncId {%s}", options.email, results[0].appSyncId);
                                options.success(results[0].appSyncId); 
                                return;                       
                           },
                           error: function (error) {
                             console.error("%s: Error updating userId for %s in AppSyncUsers with appSyncId {%s}\n\n%s", new Date(), options.email, record.appSyncId, error.message);
                             throw error;                               
                           } 
                        });
                    } else {
//                        console.log("User %s exists with appSyncId {%s}", options.email, results[0].appSyncId);
                        options.success(results[0].appSyncId);  
                        return;                      
                    }
                }
            },
            error: function (error) {
                console.error("%s: Error retrieving user record %s from AppSyncUsers\n\n%s", new Date(), options.email, error.message);
                throw error;
            }
        });
}

function processClientChanges(options, request) {
    console.log("%s: Processing client changes for table: %s", new Date(), options.tableName);
    var serverChanges = [], serverKeys = [], table = request.service.tables.getTable(options.tableName);
    if (options.values.length > 0) {
        var valuesEnum = Enumerable.From(options.values);
        var sql = "select * from stirlingmoney." + options.tableName + " where " + options.idField + " in (";
        for (var i=0; i< options.values.length; i++) {
            sql = sql + "'" + options.values[i][options.idField] + "',"
        }
        sql = sql.substr(0, sql.length - 1);
        sql = sql + ")";
//        console.log(sql);
        request.service.mssql.query(sql, {
            success: function(results) {
//                console.log(results.length + " results matching client keys in " + options.tableName);
                if(results.length > 0) {
                    results.forEach(function(item) {
                        serverKeys.push(item[options.idField].toLowerCase());
                        if(item.appSyncId !== options.appSyncId) {
                            console.error("%s: User %j made an unauthorized attempt to edit record {" + item[options.idField] + "} in table " + options.tableName, new Date(), options.user);
                            throw { error: new Error("Attempt made to edit unauthorized record"), statusCode: statusCodes.UNAUTHORIZED};
                        } else {
                            var clientVal = valuesEnum.Where(function(it) {
                                return it[options.idField].toLowerCase() === item[options.idField].toLowerCase();
                            }).FirstOrDefault(null);
//                            console.log("Record {" + clientVal[options.idField] + "} in " + options.tableName + "has server update time: " + item.editDateTime + " and client update time: " + new Date(clientVal.editDateTime));
                            if(clientVal && item.editDateTime < new Date(clientVal.editDateTime)) {
                                //Update the server entry
//                                console.log("Updating Server Entry");
                                clientVal.appSyncId = options.appSyncId;
                                clientVal.id = item.id;
//                                console.log("ClientValue: %j", clientVal);
                                table.update(clientVal, {
                                    success: function () {
                                        console.log("%s: Updated record {" + clientVal[options.idField] + "} in " + options.tableName, new Date());
                                    },
                                    error: function(error) {
                                        console.error("%s: %s", new Date(), error);
                                        throw error;
                                    }
                                });
                            } else {
                                console.log("%s: Server value newer than client value", new Date());
                                serverChanges.push(item);
                            }
                        }
                    });
                }
            },
            error: function(error) {
                console.error("%s: Error processing update sql query: %s", new Date(), sql);
                throw error;
            }
        });
        var serverEnum = Enumerable.From(serverKeys);
        var insertValues = valuesEnum.Where(function(it) { return !serverEnum.Contains(it[options.idField].toLowerCase()); }).ToArray();
        var insertOptions = {
            tableName: options.tableName,
            idField: options.idField,
            appSyncId: options.appSyncId,
            values: insertValues,
            lastSyncDate: options.lastSyncDate,
            processedKeys: serverKeys,
            serverChanges: serverChanges,
            success: options.success,
            error: options.error
        };
        processClientInserts(insertOptions, request);
    } else {
        //No client changes
        var serverOptions = {
            tableName: options.tableName,
            idField: options.idField,
            appSyncId: options.appSyncId,
            lastSyncDate: options.lastSyncDate,
            processedKeys: serverKeys,
            serverChanges: serverChanges,
            success: options.success,
            error: options.error
        };
        processServerChanges(serverOptions, request);
    }
}

function processClientInserts(options, request) {
    var table = request.service.tables.getTable(options.tableName);
    if(options.values.length > 0) {
        options.values.forEach(function(item) {
            item.appSyncId = options.appSyncId;
            item.editDateTime = new Date();
            delete item.id;
            table.insert(item, {
                success: function () {
                    options.processedKeys.push(item[options.idField].toLowerCase());
//                    console.log("Inserted item %j into table: " + options.tableName, item);
                    options.serverChanges.push(item);
                },
                error: function(error) {
                    console.error("%s: Failed to insert item %j into table: %s\n\n%s", new Date(), item, options.tableName, error);
                    throw error;
                }
            });
        });
    } else {
        console.log("%s: No records to insert for table %s", new Date(), options.tableName);
    }
    var serverOptions = {
        tableName: options.tableName,
        idField: options.idField,
        appSyncId: options.appSyncId,
        lastSyncDate: options.lastSyncDate,
        processedKeys: options.processedKeys,
        serverChanges: options.serverChanges,
        success: options.success,
        error: options.error
    };
    processServerChanges(serverOptions, request);
}

function processServerChanges(options, request) {
//    console.log("Processing server changes for table: " + options.tableName);
    var sql = "select * from stirlingmoney." + options.tableName + " where editDateTime > ?";
    if(options.processedKeys.length > 0) {
        sql = sql + " and " + options.idField + " not in (";
        for(var i=0; i < options.processedKeys.length; i++) {
            sql = sql + "'" + options.processedKeys[i] + "',"
        }
        sql = sql.substr(0, sql.length - 1);
        sql = sql + ")";
    }
    sql = sql + " and appSyncId = ?"
//    console.log(sql);
    request.service.mssql.query(sql, [options.lastSyncDate, options.appSyncId], {
        success: function(results) {
            for(var i=0;i<results.length;i++) {
                options.serverChanges.push(results[i]);
            }
//            console.log(options.serverChanges.length + " server changes in table: " + options.tableName);
            var retResults = {
                tableName: options.tableName,
                changes: options.serverChanges
            }
            options.success(retResults);
        },
        error: function(error) {
            throw error;
        }
    });
}