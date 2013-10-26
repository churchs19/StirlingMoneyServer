exports.post = function(request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    try {
        require("linq");
        console.log("/sync POST with item '%j'", request.body);
        var body = request.body;
        if(!body.lastSyncDate || 
            !body.items) {
                console.error("Invalid request body: %j", request.body);
                response.send(statusCodes.BAD_REQUEST);
        }
        for(var i=0;i<body.items.length;i++) {
            processClientChanges(body.items[i].tableName, body.items[i].keyField, body.items[i].values, request);
        }
           
        response.send(statusCodes.OK, { message : 'Hello World!' });
    } catch(e) {
        console.error("Unhandled Exception: " + e);
        response.send(statusCodes.INTERNAL_SERVER_ERROR, {message : e});
    }
}

function isUserAuthorized() {
    return true;
}

function processClientChanges(tableName, idField, values, request) {
    console.log("Processing client changes for table: " + tableName);
    console.log("Key Field Name = " + idField);
    var table = request.service.tables.getTable(tableName);
    var serverChanges = [];
    var count = 0;
    var keys = []
    for(var i=0; i< values.length; i++) {
        keys.push(values[i][idField]);
    }
    table.where(function(keysArray) {
        return this[idField] in keysArray;
    }, keys)
        .read({
            success: function(results) {
                console.log(results.length + " results matching client keys in " + tableName);
                results.forEach(function(item) {
                   console.log(item[idField]); 
                });
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