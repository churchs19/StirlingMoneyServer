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