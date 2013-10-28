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
                        response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : error});
                    } else {
                        response.send(statusCode, {message: error});
                    }
                }
            };
            processClientChanges(options, request);
        });
    } catch (e) {
        console.error("Unhandled Exception: " + e);
        response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : e});
    }
};

function GetAuthorizedUserIds(request) {
    var ids = [];
    //ids.push(request.user.userId);
    return ids;
}

function processClientChanges(options, request) {
    console.log("Processing user (%j) client changes for table: " + options.tableName, options.user);
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
                        if(item.userId !== options.user.userId || !(item.userId in options.userIds)) {
                            console.error("User %j made an unauthorized attempt to edit record {" + item[options.idField] + "} in table " + options.tableName, options.user);
                            options.error("Attempt made to edit unauthorized record", statusCodes.UNAUTHORIZED)
                        } else {
                            serverKeys.push(item[options.idField]);
                            var clientVal = valuesEnum.Where(function(it) { return it[options.idField] === item[options.idField]; }).FirstOrDefault(null);
                            if(clientVal && item.editDateTime < clientVal.editDateTime) {
                                //Update the server entry
                                item.userId = options.user.userId;
                                table.update(item, {
                                    success: function () {
                                        console.log("Updated record {" + item[options.idField] + "} in " + options.tableName);
                                        count++;
                                        if(count===results.length) {
                                            var insertOptions = {
                                                tableName: options.tableName,
                                                idField: options.idField,
                                                user: options.user,
                                                userIds: options.userIds,
                                                values: valuesEnum.Where(function(it) { return !(it[options.idField] in serverKeys); }).ToArray(),
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
                                        options.error(error);
                                    }
                                });
                            } else {
                                serverChanges.push(item);
                                count++;
                                if(count===results.length) {
                                    var insertOptions = {
                                        tableName: options.tableName,
                                        idField: options.idField,
                                        user: options.user,
                                        userIds: options.userIds,
                                        values: valuesEnum.Where(function(it) { return !(it[options.idField] in serverKeys); }).ToArray(),
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
                    var insertOptions = {
                        tableName: options.tableName,
                        idField: options.idField,
                        user: options.user,
                        userIds: options.userIds,
                        values: valuesEnum.Where(function(it) { return !(it[options.idField] in serverKeys); }).ToArray(),
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
                options.error(error);
            }
        });
    } else {
//        var serverOptions = {
//            tableName: options.tableName,
//            idField: options.idField,
//            user: options.user,
//            userIds: options.userIds,
//            lastSyncDate: options.lastSyncDate,
//            processedKeys: serverKeys,
//            serverChanges: serverChanges,
//            success: options.success,
//            error: options.error
//        };
//        processServerChanges(serverOptions, request);
        options.success({ tableName: options.tableName, changes: options.serverChanges });
    }
}

function processClientInserts(options, request) {
    console.log("Processing client inserts for table: " + options.tableName);
    console.log("Insert options: %j", options);
    var count = 0;
    var table = request.service.tables.getTable(options.tableName);
    options.values.forEach(function(item) {
        item.userId = options.user.userId;
        item.editDateTime = new Date();
        delete item.id;
        table.insert(item, {
            success: function () {
                options.processedKeys.push(item[options.idField]);
                console.log("Inserted item %j into table: " + options.tableName, item);
                count++;
                if(count===options.values.length) {
//                    var serverOptions = {
//                        tableName: options.tableName,
//                        idField: options.idField,
//                        user: options.user,
//                        userIds: options.userIds,
//                        lastSyncDate: options.lastSyncDate,
//                        processedKeys: options.processedKeys,
//                        serverChanges: options.serverChanges,
//                        success: options.success,
//                        error: options.error
//                    };
//                    processServerChanges(serverOptions, request);
                    options.success({ tableName: options.tableName, changes: options.serverChanges });
                }
            },
            error: function(error) {
                console.log("Failed to insert item %j into table: %s", [item, options.tableName]);
                options.error(error);
            }
        });
    });
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