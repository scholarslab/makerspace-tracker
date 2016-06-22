/******************************
  * Requireds
******************************/
var aws = require('aws-sdk');
var crypto = require('crypto');
var dotenv = require('dotenv');
var express = require('express');
var fs = require('fs');
var moment = require('moment');
var multer = require('multer');
var multers3 = require('multer-storage-s3');
var path = require('path');
var pg = require('pg');
var rstring = require('randomstring');
var Sequelize = require('sequelize');
var util = require('util');
var valid = require('express-validator');


/******************************
  * Settings
******************************/
var app = express();

// Load local environment variables from .env file
dotenv.load();

// database connection
DB_URL = process.env.DATABASE_URL;
pg.defaults.ssl = true;
var sqlize = new Sequelize(DB_URL);

// Database Models
var Print = sqlize.define('print', {
  print_id: { type: Sequelize.INTEGER, field: 'print_id', allowNull: false, unique: true, autoIncrement: true, primaryKey: true },
  patron_id: { type: Sequelize.STRING, field: 'patron_id', allowNull: false },
  patron_grade: { type: Sequelize.STRING, field: 'patron_grade', allowNull: false },
  patron_department: { type: Sequelize.STRING, field: 'patron_department', allowNull: false },
  tech_id: { type: Sequelize.STRING, field: 'tech_id', allowNull: false },
  date_created: { type: Sequelize.DATE, field: 'date_created', allowNull: false, defaultValue: Sequelize.NOW },
  date_modified: { type: Sequelize.DATE, field: 'date_modified', allowNull: false },
  date_started: { type: Sequelize.DATE, field: 'date_started', allowNull: false },
  date_finished: { type: Sequelize.DATE, field: 'date_finished', allowNull: false },
  printer_setup: { type: Sequelize.TEXT, field: 'printer_setup' },
  notes: { type: Sequelize.TEXT, field: 'notes' },
  image_file: { type: Sequelize.STRING, field: 'image_file' },
  print_file: { type: Sequelize.STRING, field: 'print_file' }
  },
  {createdAt: 'date_created', updatedAt: 'date_modified'}
);

// Set the port to listen on
app.set('port', (process.env.PORT || 5000));

// public folder
app.use(express.static(__dirname + '/public'));
app.use('/files', express.static(__dirname + '/files'));

// Use express-validator 
app.use(valid());

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'pug');

// global variables
app.locals.image_path = 'files/images/';
app.locals.shape_path = 'files/shapes/';
app.locals.moment = require('moment');

// Save files to S3
var s3bucket = new aws.S3({params: {Bucket: process.env.S3_BUCKET}});
var storage = multers3({
  bucket: process.env.S3_BUCKET,
  destination: function (req, file, cb) {
    //detect mimetype. if octet-stream save in shapes directory
    if ( file.mimetype == 'application/octet-stream' ){
      cb(null, req.app.locals.shape_path);
    }
  },
  filename: function (req, file, cb) {
    // don't save file extension?
    // https://github.com/expressjs/multer/issues/170
    // If shape file, save with .stl
    if ( file.mimetype == 'application/octet-stream' ){
        var nameDateTime = moment().format('YYYY-MM-DD-kk-mm-ss');
        var fileExt = path.extname(file.originalname);
        var fileName = path.basename(file.originalname, fileExt);
        cb(null, nameDateTime + '-' + fileName + '-' + rstring.generate({length:8}) + fileExt);
    } else {
      // return error that only accepts certain file types
    }
  }
});
var upload = multer({ storage: storage });


/******************************
  * Routes
******************************/
// Home Page: 
// Show the prints in the database
// http://localhost/
app.get('/', function(req, res) {
  Print.all().then(function(prints) {
    res.render('prints', {results: prints} ); 
  });
});

// Detail Page:
// Display detail info about print 
// // http://localhost/detail/printID
app.get('/detail/:id', function (req, res) {
  Print.findById(req.params.id).then(function(print) {
    res.render('detail', {results: print});
  });
});

// Delete Print Route::
// Delete the specified print 
// // http://localhost/detail/delete/printID
app.delete('/detail/:id/delete', function (req, res) {
  Print.findById(req.params.id).then(function(print) {
    console.log(print.image_file);
    Print.destroy({where: {print_id: req.params.id}});
    var params = { 
      Bucket:  process.env.S3_BUCKET,
      Delete: {
        Objects: [
          { Key: print.image_file },
          { Key: print.print_file }
        ]
      }
    };
    s3bucket.deleteObjects(params, function(err, data) {
      if (err) {
        console.log(err); 
      } else {
        res.redirect('/');
      }
    });
    
  });
});

// Capture Page (blank form):
// http://localhost/capture
app.get('/capture', function (req, res) {
  res.render('capture');
});

// Capture Page (handle results from POST):
// http://localhost/capture
app.post('/capture', upload.single('print_file'), function(req, res) {

  var timeFormat = 'YYYY-MM-DD kk:mm:ss';
  var rightNow = moment().format(timeFormat);
  
  // Filter input
  var patronID = req.body.patron_id;
  req.checkBody('patron_id', 'Patron ID must not be empty').notEmpty().isAlphanumeric();

  var patronGrade = req.body.patron_grade;
  req.checkBody('patron_grade', 'Patron Grade must not be empty.').notEmpty().isAlpha();

  var patronDept = req.body.patron_department;
  req.checkBody('patron_department', 'Patron Department must not be empty').notEmpty().isAlpha();

  var techID = req.body.tech_id;
  req.checkBody('tech_id', 'Tech ID must not be empty').notEmpty().isAlphanumeric();

  var dateCreated = rightNow;
  var dateModified =  rightNow;

  var fdate = req.body.date_finished.replace(/T/, ' ');
  var dateFinished = moment(fdate).format(timeFormat);
  req.checkBody('date_finished', 'Please enter a valid finished date').notEmpty().isDate();

  var sdate = req.body.date_started.replace(/T/, ' ');
  var dateStarted = moment(sdate).format(timeFormat);
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
    res.render('capture', {errors: valErrors, fields: req.body} );
    if(shapePath !== '') {
      // delete the uploaded file
      fs.unlink(shapePath);
    }
    return;
  } else {
    
    var imageName = '';
    // image file is handled here
    if (req.body.image_file !== '') {
      // get image data and convert from base64 to file and save to disk
      // generate name for image file and store the path in the database
      // http://stackoverflow.com/questions/10645994/node-js-how-to-format-a-date-string-in-utc
      var nameDate = moment().format('YYYY-MM-DD-kk-mm-ss');
      imageName = req.app.locals.image_path + nameDate + '-' + rstring.generate({length:11}) + '.jpg';
      var imagePath = __dirname + '/' + imageName;

      //var img = Buffer.from(req.body.image_file, 'base64');
      var data = { Key: imageName, Body: req.body.image_file, ContentEncoding: 'base64', ContentType: 'image/jpg' };
      s3bucket.putObject(data, function (err, data) {
        if (err) {
          console.log('Error uploading: ',  err);
        } else {
          console.log('Uploaded file successfully');
        }
      });

    }

    // add info to the database
    pg.connect(DB_URL, function(err, client, done) {
      if(err) {
        return console.error('error fetching client from pool', err);
      }
      client.query('INSERT INTO prints (patron_id, patron_grade, patron_department, tech_id, date_created, date_modified, date_started, date_finished, printer_setup, notes, image_file, print_file) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [patronID, patronGrade, patronDept, techID, dateCreated, dateModified, dateStarted, dateFinished, printerSetup, notes, imageName, shapePath] , function(dberr, result) {
        done();
        if(dberr) {
          res.render('capture', {dbErr: dberr, fields: req.body} );
          if(shapePath !== '') {
            // delete the uploaded file
            fs.unlink(shapePath);
          }
          if (req.body.image_file !== '') {
            fs.unlink(imagePath);
          }
          return console.error('error running query', dberr);
        }
      });
    });

    res.render('capture');
  }

});


/******************************
  * Start the web server
******************************/
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
