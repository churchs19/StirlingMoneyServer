var Enumerable = require("linq");

exports.post = function (request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    try {
        console.log("/sync POST with request '%j' by user %s", [request.body, request.user]);
        var body = request.body, count = 0, results = [];
        if (!body.lastSyncDate ||
                !body.items) {
            console.error("Invalid request body: %j", request.body);
            response.send(statusCodes.BAD_REQUEST, {message: "Invalid request body"});
        }
        body.items.forEach(function (item) {
            var options = {
                tableName: item.tableName,
                idField: item.keyField,
                user: request.user,
                userIds: [],
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
                    console.error("Error occurred processing request '%j' from user '%j':\n\n" + error, request.body, request.user);
                    if (!statusCode) {
                        throw { statusCode: statusCodes.INTERNAL_SERVER_ERROR, error: error };
                    } else {
                        throw { statusCode: statusCode, error: error };
                    }
                }
            };
            processClientChanges(options, request);
        });
    } catch (e) {
        if (e.statusCode) {
            response.send(e.statusCode, {message:e.error});
        } else {
            console.error("Unhandled Exception: " + e);
            response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : e});
        }
    }
};

function GetAuthorizedUserIds(request) {
    var ids = [];
    //ids.push(request.user.userId);
    return ids;
}

function processClientChanges(options, request) {
    try {
        console.log("Processing user (%s) client changes for table: %s", [options.user.userId, options.tableName]);
        var serverChanges = [], serverKeys = [], table = request.service.tables.getTable(options.tableName);
        if (options.values.length > 0) {
            var valuesEnum = Enumerable.From(options.values);
            var sql = "select * from stirlingmoney." + options.tableName + " where " + options.idField + " in (";
            for (var i=0; i< options.values.length; i++) {
                sql = sql + "'" + options.values[i][options.idField] + "',"
            }
            sql = sql.substr(0, sql.length - 1);
            sql = sql + ")";
            console.log(sql);
            request.service.mssql.query(sql, {
                success: function(results) {
                    console.log(results.length + " results matching client keys in " + options.tableName);
                    var count = 0;
                    if(results.length > 0) {
                        results.forEach(function(item) {
                            serverKeys.push(item[options.idField].toLowerCase());                            
                            if(item.userId !== options.user.userId && !(item.userId in options.userIds)) {
                                console.error("User %j made an unauthorized attempt to edit record {" + item[options.idField] + "} in table " + options.tableName, options.user);
                                throw { error: new Error("Attempt made to edit unauthorized record"), statusCode: statusCodes.UNAUTHORIZED};
                            } else {
                                var clientVal = valuesEnum.Where(function(it) {
                                    return it[options.idField].toLowerCase() === item[options.idField].toLowerCase();
                                }).FirstOrDefault(null);
                                if(clientVal && item.editDateTime < clientVal.editDateTime) {
                                    //Update the server entry
                                    item.userId = options.user.userId;
                                    table.update(item, {
                                        success: function () {
                                            console.log("Updated record {" + item[options.idField] + "} in " + options.tableName);
                                            count++;
                                            if(count===results.length) {
                                                var serverEnum = Enumerable.From(serverKeys);
                                                var insertValues = valuesEnum.Where(function(it) { return !serverEnum.Contains(it[options.idField].toLowerCase()); }).ToArray();
                                                var insertOptions = {                                                    
                                                    tableName: options.tableName,
                                                    idField: options.idField,
                                                    user: options.user,
                                                    userIds: options.userIds,
                                                    values: insertValues,
                                                    lastSyncDate: options.lastSyncDate,
                                                    processedKeys: serverKeys,
                                                    serverChanges: serverChanges,
                                                    success: options.success,
                                                    error: options.error
                                                };
                                                processClientInserts(insertOptions, request);
                                            }
                                        },
                                        error: function(error) {
                                            throw error;
                                        }
                                    });
                                } else {
                                    console.log("Server value newer than client value");
                                    serverChanges.push(item);
                                    count++;
                                    if(count===results.length) {
                                        var serverEnum = Enumerable.From(serverKeys);
                                        var insertValues = valuesEnum.Where(function(it) { return !serverEnum.Contains(it[options.idField].toLowerCase()); }).ToArray();
                                        var insertOptions = {
                                            tableName: options.tableName,
                                            idField: options.idField,
                                            user: options.user,
                                            userIds: options.userIds,
                                            values: insertValues,
                                            lastSyncDate: options.lastSyncDate,
                                            processedKeys: serverKeys,
                                            serverChanges: serverChanges,
                                            success: options.success,
                                            error: options.error
                                        };
                                        processClientInserts(insertOptions, request);
                                    }
                                }
                            }
                        });
                    } else {
                        //No matching records from server - only client inserts
                        var serverEnum = Enumerable.From(serverKeys);
                        var insertValues = valuesEnum.Where(function(it) { return !serverEnum.Contains(it[options.idField].toLowerCase()); }).ToArray();
                        var insertOptions = {
                            tableName: options.tableName,
                            idField: options.idField,
                            user: options.user,
                            userIds: options.userIds,
                            values: insertValues,
                            lastSyncDate: options.lastSyncDate,
                            processedKeys: serverKeys,
                            serverChanges: serverChanges,
                            success: options.success,
                            error: options.error
                        };
                        processClientInserts(insertOptions, request);
                    }
                },
                error: function(error) {
                    console.log("Error processing update sql query: %s", sql);
                    throw error;
                }
            });
        } else {
            //No client changes
            var serverOptions = {
                tableName: options.tableName,
                idField: options.idField,
                user: options.user,
                userIds: options.userIds,
                lastSyncDate: options.lastSyncDate,
                processedKeys: serverKeys,
                serverChanges: serverChanges,
                success: options.success,
                error: options.error
            };
            processServerChanges(serverOptions, request);
        }
    } catch (e) {
        options.error(e);
    }
}

function processClientInserts(options, request) {
    try
    {
        var count = 0;
        var table = request.service.tables.getTable(options.tableName);
        if(options.values.length > 0) {
            options.values.forEach(function(item) {
                item.userId = options.user.userId;
                item.editDateTime = new Date();
                delete item.id;
                table.insert(item, {
                    success: function () {
                        options.processedKeys.push(item[options.idField].toLowerCase());
                        console.log("Inserted item %j into table: " + options.tableName, item);
                        options.serverChanges.push(item);
                        count++;
                        if(count===options.values.length) {
                            var serverOptions = {
                                tableName: options.tableName,
                                idField: options.idField,
                                user: options.user,
                                userIds: options.userIds,
                                lastSyncDate: options.lastSyncDate,
                                processedKeys: options.processedKeys,
                                serverChanges: options.serverChanges,
                                success: options.success,
                                error: options.error
                            };
                            processServerChanges(serverOptions, request);
                        }
                    },
                    error: function(error) {
                        console.log("Failed to insert item %j into table: %s", [item, options.tableName]);
                        throw error;
                    }
                });
            });
        } else {
            console.log("No records to insert for table %s", options.tableName);
            var serverOptions = {
                tableName: options.tableName,
                idField: options.idField,
                user: options.user,
                userIds: options.userIds,
                lastSyncDate: options.lastSyncDate,
                processedKeys: options.processedKeys,
                serverChanges: options.serverChanges,
                success: options.success,
                error: options.error
            };
            processServerChanges(serverOptions, request);
        }
    }
    catch (e) {
        options.error(e);
    }
}

function processServerChanges(options, request) {
//    console.log("Processing server changes for table: " + options.tableName);
//    var sql = "select * from stirlingmoney." + options.tableName + " where editDateTime > ?";
//    if(options.processedKeys.length > 0) {
//        sql = sql + " and " + options.idField + " not in (";
//        for(var i=0; i < options.processedKeys.length; i++) {
//            sql = sql + "'" + options.processedKeys[i] + "',"
//        }
//        sql = sql.substr(0, sql.length - 1);
//        sql = sql + ")";
//    }
//    if(options.userIds.length > 0) {
//        sql = sql + " and userId in (";
//        for(var j=0; j<options.userIds.length; j++) {
//            sql = sql + "'" + options.userIds[j] + "',"
//        }
//        sql = sql.substr(0, sql.length - 1);
//        sql = sql + ")";
//    }
//    console.log(sql);
//    request.service.mssql.query(sql, [options.lastSyncDate], {
//        success: function(results) {
//            for(var i=0;i<results.length;i++) {
//                options.serverChanges.push(results[i]);
//            }
//            console.log(options.serverChanges.length + " server changes in table: " + options.tableName);
//            var retResults = {
//                tableName: options.tableName,
//                changes: options.serverChanges
//            }
//            options.success(retResults);
//        },
//        error: function(error) {
//            options.error(error);
//        }
//    });
//    options.success
}