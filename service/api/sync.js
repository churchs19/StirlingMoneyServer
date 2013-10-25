exports.post = function(request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    try {
    console.log("/sync POST with request: " + request.body);
    var body = request.body;
    if(!body.lastSyncDate || 
        !body.items) {
            response.send(statusCodes.BAD_REQUEST);
    }
    for(var i=0;i<body.items.length;i++) {
        processClientChanges(body.items[i].name, body.items[i].values, request);
    }
       
    response.send(statusCodes.OK, { message : 'Hello World!' });
    } catch(e) {
        response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : e});
    }
}

function isUserAuthorized() {
    return true;
}

function processClientChanges(tableName, items, request) {
    console.log("Processing client changes for table: " + tableName);
    var idField = tableName + "Id";
    var table = request.service.tables.getTable(tableName);
    console.log("Key Field Name = " + idField);
    var serverChanges = [];
    var count = 0;
    if(items.length > 0) {
        items.forEach(function(entry, index) {
            console.log("Item GUID: {" + entry[idField] + "}");
            table.where(function(item) {
                return this[idField] === item;
            }, entry[idField])
                .read({
                    success: function(results) {
                        console.log(tableName + " Item: {" + entry[idField] + "} query returned " + results.length + " results");
/*                        if(results.length>0 && results[0].UserId == user.userId) {
                            if(results[0].EditDateTime < entry.EditDateTime) {
                                //Update the server entry
                                entriesTable.update(entry, {
                                    success: function () {
                                        count++;
                                        if(count===items.length) {
                                            processServerChanges(item, user, request, serverChanges);
                                        }
                                    }
                                });
                            } else {
                                //Add the server entry to the server changes array
                                serverChanges.push(results[0]); 
                                count++;
                                if(count===entries.length) {
                                    processServerChanges(item, user, request, serverChanges);
                                }
                            }
                        } else {
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
                        console.log(error);
                    }	
                });
        });
    } /*else { 
        processServerChanges(item, user, request, serverChanges);
    } */ 
}

function processServerChanges(item, user, request, serverChanges) {
	var sql = "select * from AzureEntry where EditDateTime > ? and UserId = ?";
    var params = [];
    params.push(item.lastSyncDate);
    params.push(user.userId);
	if(item.entries.length > 0) {
        sql+=" and EntryGuid NOT IN (";
        for(var i = 0; i<item.entries.length; i++) {
            sql+="?,";
            params.push(item.entries[i].EntryGuid);            
        }
        sql = sql.substr(0, sql.length-1) + ")";
    }
//    console.log(sql);
//    console.log(params);
    request.service.mssql.query(sql, params, {
        success: function(results) {
            serverChanges = serverChanges.concat(results);
            var requestResult = {
                ServerChanges : serverChanges
            };
            request.respond(statusCodes.OK, requestResult);
        }
    });
}