var linq = require("linq");

exports.post = function (request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    try {
        console.log("/sync POST with request '%j'", request);
        var body = request.body, count = 0, results = [];
        if (!body.lastSyncDate ||
                !body.items) {
            console.error("Invalid request body: %j", request.body);
            response.send(statusCodes.BAD_REQUEST);
        }
        for (var i=0;i<body.items.length;i++) {
            var options = {
                table:  request.service.tables.getTable(body.items[i].tableName),
                tableName: body.items[i].tableName,
                idField: body.items[i].keyField,
//                user: request.user,
                userIds: [],
                values: body.items[i].values,
                lastSyncDate: body.lastSyncDate,
                success: function(serverChanges) {
                    results.push(serverChanges);
                    count++;
                    if(count === body.items.length) {
                        response.send(statusCodes.OK, results);   
                    }
                },
                error: function(error, statusCode) {
                    console.error("Error occurred processing request '%j' from user '%j':\n\n" + error, request.body, request.user);
                    if(!statusCode) {
                        response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : error});
                    } else {
                        response.send(statusCode, {message: error});
                    }
                }
            };
            processClientChanges(options);
        }
    } catch(e) {
        console.error("Unhandled Exception: " + e);
        response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : e});
    }
}

function GetAuthorizedUserIds(request) {
    var ids = [];
    //ids.push(request.user.userId);
    return ids;
}

function processClientChanges(options) {
    console.log("Processing client changes for table: " + options.tableName);
    console.log("Key Field Name = " + options.idField);
    var serverChanges = [];
    var keys = [];
    var serverKeys = [];
    if(options.values.length > 0) {
    var valuesEnum = linq.Enumerable.From(options.values);
    for(var i=0; i< options.values.length; i++) {
        keys.push(options.values[i][options.idField]);
    }
    options.table.where(function(keysArray) {
        return this[options.idField] in keysArray;
    }, keys)
        .read({
            success: function(results) {
                console.log(results.length + " results matching client keys in " + options.tableName);
                var count = 0;
                if(results.length > 0) {
                    results.forEach(function(item) {
                        serverKeys.push(item[options.idField]);
                        var clientVal = valuesEnum.Where(function(it) { return it[options.idField] === item[options.idField]; }).FirstOrDefault(null);
                        if(!(item.userId in options.userIds)) {
                            options.error("Unauthorized access", statusCodes.UNAUTHORIZED);
                            return;
                        }
                        if(clientVal && item.editDateTime < clientVal.editDateTime) {
                            //Update the server entry
//                            item.userId = options.user.userId;
                            options.table.update(item, {
                                success: function () {
                                    console.log("Updated record {" + item[options.idField] + "} in " + options.tableName);
                                    count++;
                                    if(count===results.length) {
                                        var insertOptions = {
                                            tableName: options.tableName,
                                            table: options.table,
                                            idField: options.idField,
//                                            user: options.user,
                                            userIds: options.userIds,
                                            values: valuesEnum.Where(function(it) { return !(it[options.idField] in serverKeys); }).ToArray(),
                                            lastSyncDate: options.lastSyncDate,
                                            processedKeys: serverKeys,
                                            serverChanges: serverChanges,
                                            success: options.success,
                                            error: options.error
                                        };
                                        processClientInserts(options);
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
                                    table: options.table,
                                    idField: options.idField,
//                                    user: options.user,
                                    userIds: options.userIds,
                                    values: valuesEnum.Where(function(it) { return !(it[options.idField] in serverKeys); }).ToArray(),
                                    lastSyncDate: options.lastSyncDate,
                                    processedKeys: serverKeys,
                                    serverChanges: serverChanges,
                                    success: options.success,
                                    error: options.error
                                };
                                processClientInserts(options);
                            }
                        }
                    });
                } else {
                    var serverOptions = {
                        tableName: options.tableName,
                        table: options.table,
                        idField: options.idField,
//                        user: options.user,
                        userIds: options.userIds,
                        lastSyncDate: options.lastSyncDate,
                        processedKeys: serverKeys,
                        serverChanges: serverChanges,
                        success: options.success,
                        error: options.error
                    };
                    processServerChanges(options);
                }
/*            } else {
                //New Entry
                entry.UserId = user.userId;
                entry.EditDateTime = new Date();
                delete entry.id;
                entriesTable.insert(entry, {
                    success: function () {
                        serverChanges.push(entry);
                        count++;
                        if(count===entries.length) {
                            processServerChanges(item, user, request, serverChanges);
                        }
                    }
                });
            } */
            
        },
        error: function(error) {
            options.error(error);
        }	
    });
    } else {
        var serverOptions = {
            tableName: options.tableName,
            table: options.table,
            idField: options.idField,
//            user: options.user,
            userIds: options.userIds,
            lastSyncDate: options.lastSyncDate,
            processedKeys: serverKeys,
            serverChanges: serverChanges,
            success: options.success,
            error: options.error
        };
        processServerChanges(options);
    }
}
                                
function processClientInserts(options) {
    console.log("Processing client inserts for table: " + options.tableName);    
    var count = 0;
    options.values.forEach(function(item) {
//        item.userId = options.user.userId;
        item.editDateTime = new Date();
        delete item.id;
        options.table.insert(item, {
            success: function () {
                options.processedKeys.push(item[options.idField]);
                console.log("Inserted item %j into table: " + options.tableName, item);
                options.serverChanges.push(item);
                count++;
                if(count===options.values.length) {
                    var serverOptions = {
                        tableName: options.tableName,
                        table: options.table,
                        idField: options.idField,
//                        user: options.user,
                        userIds: options.userIds,
                        lastSyncDate: options.lastSyncDate,
                        processedKeys: options.processedKeys,
                        serverChanges: options.serverChanges,
                        success: options.success,
                        error: options.error
                    };
                    processServerChanges(options);
                }
            },
            error: function(error) {
                options.error(error);   
            }
        });
    });
}

function processServerChanges(options) {
    console.log("Processing server changes for table: " + options.tableName);
    options.table.where(function(itemOptions) {
        return ((!(this[itemOptions.idField] in options.processedKeys)) /*&& (this.userId in options.userIds)*/ && (this.editDateTime >= options.lastSyncDate));
    }, options).read({
        success: function(results) {
            for(var i=0;i<results.length;i++) {
                options.serverChanges.push(results[i]);   
            }
            console.log(options.serverChanges.length + " server changes in table: " + options.tableName);
            var retResults = {
                tableName: options.tableName,
                changes: options.serverChanges
            }
            options.success(retResults);
        },
        error: function(error) {
            options.error(error);
        }
    });
}