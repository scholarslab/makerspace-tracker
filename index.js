/******************************
  * Requireds
******************************/
var express = require('express');
var pg = require('pg');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var moment = require('moment');
var rstring = require('randomstring');
var multer = require('multer');


/******************************
  * Settings
******************************/
var app = express();

// Form handling
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    //detect mimetype. if octet-stream save in shapes directory
    if ( file.mimetype == 'application/octet-stream' ){
      cb(null, 'files/shapes');
    }
  },
  filename: function (req, file, cb) {
    // don't save file extension?
    // https://github.com/expressjs/multer/issues/170
    // If shape file, save with .stl
    if ( file.mimetype == 'application/octet-stream' ){
        var date_time = new Date().toISOString().replace(/:/g, '-').substr(0,19);
        var file_ext = path.extname(file.originalname);
        var file_name = path.basename(file.originalname, file_ext);
        cb(null, date_time + '-' + file_name + '-' + rstring.generate({length:8}) + file_ext);
    } else {
      // return error that only accepts certain file types
    }
  }
});

var upload = multer({ storage: storage });

// Set the port to listen on
app.set('port', (process.env.PORT || 5000));

// public folder
app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

// global variables
app.locals.image_path = '/files/images/';
app.locals.shape_path = '/files/shapes/';


/******************************
  * Routes
******************************/
// Home Page: 
// http://localhost/
app.get('/', function(request, response) {
  var date_time = moment().format('YYYY-MM-DD HH:MM:SS');
  console.log(date_time)
  response.render('create');
});

// Results Page:
// Display the results of the database
// http://localhost/prints
app.get('/prints', function (request, response) {
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query('SELECT * FROM prints', function(err, result) {
      done();
      if (err)
       { console.error(err); response.send("Error " + err); }
      else
       { response.render('prints', {results: result.rows} ); }
    });
  });
});

// Home Page (post results):
// http://localhost/
app.post('/', upload.single('print_file'), function(req, res, next) {

  var date_started = req.body.date_started != '' ? moment(req.body.date_started).format('YYYY-MM-DD HH:MM:SS') : '';
  var date_finished = req.body.date_finished != '' ? moment(req.body.date_finished).format('YYYY-MM-DD HH:MM:SS') : '';
  var file_path = req.file.path != '' ? req.file.path : '';
  // shape file is handled with 'multer' 
  // image file is handled here
  if (req.body.image_file !== '') {
    // get image data and convert from base64 to file and save to disk
    // generate name for image file and store the path in the database
    // http://stackoverflow.com/questions/10645994/node-js-how-to-format-a-date-string-in-utc
    var date_time = moment().format('YYYY-MM-DD-HH-MM-SS');
    var image_name = req.app.locals.image_path + date_time + '-' + rstring.generate({length:11}) + '.jpg';
    // save print file to disk
    // http://stackoverflow.com/questions/20267939/nodejs-write-base64-image-file
    fs.writeFile(__dirname + image_name, req.body.image_file, {encoding: 'base64'}, function(err){ res.render('create'); });
  }

  // add info to the database
  pg.connect(process.env.DATABASE_URL, function(err, client, done) {
    client.query({
      text: 'INSERT INTO prints (patron_id, patron_grade, patron_department, tech_id, date_started, date_finished, printer_setup, notes, image_file, print_file) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', values: [req.body.patron_id, req.body.patron_grade.toLowerCase(), req.body.patron_department, req.body.tech_id, date_started, date_finished, req.body.printer_setup, req.body.notes, image_name, file_path] });
  });
});



/******************************
  * Start the web server
******************************/
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
