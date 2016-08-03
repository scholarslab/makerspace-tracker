/******************************
  * Requireds
******************************/
var crypto = require('crypto');
var dotenv = require('dotenv');
var express = require('express');
var fs = require('fs');
var moment = require('moment');
var util = require('util');
var valid = require('express-validator');


/******************************
  * Settings
******************************/
var app = express();

// Load local environment variables from .env file
dotenv.load();


// Set the port to listen on
app.set('port', (process.env.PORT || 5000));

// public folder
app.use(express.static(__dirname + '/public'));
app.use('/files', express.static(__dirname + '/files'));

var upload = require('./helpers/upload');
var Print = require('./models/print');

// Use express-validator 
app.use(valid());

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

// global variables
app.locals.image_path = 'files/images/';
app.locals.shape_path = 'files/shapes/';
app.locals.moment = require('moment');


/******************************
  * Routes
******************************/
// Home Page: 
// Show the prints in the database
// http://localhost/
app.get('/', function(req, res) {
  Print.forge().orderBy('date_modified', 'DESC').fetchAll().then(function(prints) {
    res.render('prints', {results: prints.models} ); 
  });
});


// Detail Routes
var detail = require('./routes/detail');
app.use('/detail', detail);

// Capture Routes
var capture = require('./routes/capture');
app.use('/capture', capture);

app.get('*', function(req, res) {
    res.redirect('/');
});

/******************************
  * Start the web server
******************************/
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
