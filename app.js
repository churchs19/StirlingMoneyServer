var express = require('express'),
    azureMobileApps = require('azure-mobile-apps');

// Set up a standard Express app
var app = express();

// If you are producing a combined Web + Mobile app, then you should handle
// anything like logging, registering middleware, etc. here

var mobile = azureMobileApps();

// Import the files from the tables directory to configure the /tables API
mobile.tables.import('./tables');

// Initialize the database before listening for incoming requests
// The tables.initialize() method does the initialization asynchronously
// and returns a Promise.
mobile.tables.initialize()
    .then(function () {
        console.log("mobile tables initialized");
        app.use(mobile);    // Register the Azure Mobile Apps middleware
        app.listen(process.env.PORT || 3000);   // Listen for requests
        console.log("App ready on " + (process.env.PORT || 3000));
    });
