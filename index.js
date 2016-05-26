/******************************
  * Requireds
******************************/
var express = require('express');
var util = require('util');
var pg = require('pg');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var moment = require('moment');
var rstring = require('randomstring');
var multer = require('multer');
var valid = require('express-validator');


/******************************
  * Settings
******************************/
var app = express();

// database connection
var dbCon = "postgres://aes9h@localhost/aes9h";

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
        var nameDateTime = new Date().toISOString().replace(/:/g, '-').substr(0,19);
        var fileExt = path.extname(file.originalname);
        var fileName = path.basename(file.originalname, file_ext);
        cb(null, nameDateTime + '-' + fileName + '-' + rstring.generate({length:8}) + fileExt);
    } else {
      // return error that only accepts certain file types
    }
  }
});

var upload = multer({ storage: storage });
app.use(valid());

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
app.locals.moment = require('moment');


/******************************
  * Routes
******************************/
// Home Page: 
// http://localhost/
app.get('/', function(req, res) {
  res.render('create');
});

// Results Page:
// Display the results of the database
// http://localhost/prints
app.get('/prints', function (request, response) {
  pg.connect(dbCon, function(err, client, done) {
    client.query('SELECT * FROM prints', function(err, result) {
      done();
      if (err)
       { console.error(err); response.status(400).send("Error " + err); }
      else
       { response.render('prints', {results: result.rows} ); }
    });
  });
});

// Home Page (post results):
// http://localhost/
app.post('/', upload.single('print_file'), function(req, res) {

  var rightNow = moment().format('YYYY-MM-DD HH:MM:SS');
  
  // Filter input
  var patronID = req.body.patron_id;
  req.checkBody('patron_id', 'Patron ID must not be empty').notEmpty().isAlphanumeric();

  var patronGrade = req.body.patron_grade.toLowerCase();
  req.checkBody('patron_grade', 'Patron Grade must be one of Undergraduate, Graduate, Faculty, or Other.').notEmpty().isAlpha();

  var patronDept = req.body.patron_department;
  req.checkBody('patron_department', 'Patron Department must not be empty').notEmpty().isAlpha();

  var techID = req.body.tech_id;
  req.checkBody('tech_id', 'Tech ID must not be empty').notEmpty().isAlphanumeric();

  var dateCreated = rightNow;
  var dateModified =  rightNow;

  var dateFinished = moment(req.body.date_finished).format('YYYY-MM-DD HH:MM:SS');
  req.checkBody('date_finished', 'Please enter a valid finished date').notEmpty().isDate();

  var dateStarted = moment(req.body.date_started).format('YYYY-MM-DD HH:MM:SS');
  req.checkBody('date_started', 'Please enter a valid start date (must be before date finished)').notEmpty().isDate().isBefore(dateFinished);

  var printerSetup = req.body.printer_setup;
  req.checkBody('tech_id', 'Tech ID must not be empty').optional().isAlphanumeric();

  var notes = req.body.notes;
  req.checkBody('tech_id', 'Tech ID must not be empty').optional().isAlphanumeric();

  // print_file is taken care of with multer, code above.
  var shapePath = '';
  if (req.file !== undefined){
    shapePath = req.file.path;
  }

  if (req.body.image_file !== '') {
    req.checkBody('image_file', 'Image not an image file').optional().isBase64();
  }

  // Validation Errors
  var valErrors = req.validationErrors(true);
  if (valErrors) {
    res.render('create', {errors: valErrors, fields: req.body} );
    if(shapePath !== '') {
      // delete the uploaded file
      fs.unlink(shapePath);
    }
    return;
  } else {
    
    // image file is handled here
    if (req.body.image_file !== '') {
      // get image data and convert from base64 to file and save to disk
      // generate name for image file and store the path in the database
      // http://stackoverflow.com/questions/10645994/node-js-how-to-format-a-date-string-in-utc
      var nameDate = moment().format('YYYY-MM-DD-HH-MM-SS');
      var imageName = req.app.locals.image_path + nameDate + '-' + rstring.generate({length:11}) + '.jpg';
      var imagePath = __dirname + imageName;
      // save print file to disk
      // http://stackoverflow.com/questions/20267939/nodejs-write-base64-image-file
      fs.writeFile(imagePath, req.body.image_file, {encoding: 'base64'}, function(err){ res.render('create'); });
    }

    // add info to the database
    pg.connect(dbCon, function(err, client, done) {
      if(err) {
        return console.error('error fetching client from pool', err);
      }
      client.query('INSERT INTO prints (patron_id, patron_grade, patron_department, tech_id, date_created, date_modified, date_started, date_finished, printer_setup, notes, image_file, print_file) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [patronID, patronGrade, patronDept, techID, dateCreated, dateModified, dateStarted, dateFinished, printerSetup, notes, imagePath, shapePath] , function(dberr, result) {
        done();
        if(dberr) {
          res.render('create', {dbErr: dberr, fields: req.body} );
          if(shapePath !== '') {
            // delete the uploaded file
            fs.unlink(shapePath);
          }
          if (req.body.image_file !== '') {
            fs.unlink(fullName);
          }
          return console.error('error running query', dberr);
        }
        // handle an error from the query
      });
    });

    res.render('create');
  }


});



/******************************
  * Start the web server
******************************/
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
