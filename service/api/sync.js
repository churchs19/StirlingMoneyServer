exports.post = function(request, response) {
    // Use "request.service" to access features of your mobile service, e.g.:
    //   var tables = request.service.tables;
    //   var push = request.service.push;
    console.log("/sync POST with request: " + request);
    response.send(statusCodes.OK, { message : 'Hello World!' });
};

exports.get = function(request, response) {
    var tables = request.service.tables;
    console.log("/sync GET with request: " + request);
    
    response.send(statusCodes.OK, { message : 'Hello World!' });
};

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