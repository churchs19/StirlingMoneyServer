exports.post = function(request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    console.log("/sync POST with request: " + request.body);
    response.send(statusCodes.OK, { message : 'Hello World!' });
}

function processClientChanges(items, user, request) {
/*    var entriesTable = request.service.tables.getTable('AzureEntry');
    var serverChanges = [];
    var count = 0;
    if(items.length > 0) {
        items.forEach(function(entry, index) {
            entriesTable.where({ EntryGuid: entry.EntryGuid })
                .read({
                    success: function(results) {
                        if(results.length>0 && results[0].UserId == user.userId) {
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
                        }
                    }	
                });
        });
    } else { 
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