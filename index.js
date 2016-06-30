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
var knex = require('knex')({client: 'pg', connection: DB_URL});
var dbPool = require('bookshelf')(knex);
var Print = dbPool.Model.extend({
  tableName: 'prints',
  idAttribute: 'print_id',
  hasTimestamps: ['date_created', 'date_modified']
});

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
  new Print().fetchAll().then(function(prints) {
    res.render('prints', {results: prints.models} ); 
  });
});

// Detail Page:
// Display detail info about print 
// // http://localhost/detail/printID
app.get('/detail/:id', function (req, res) {
  new Print({print_id: req.params.id}).fetch().then(function(print) {
    res.render('detail', {results: print.attributes});
  });
});

// Delete Print Route::
// Delete the specified print 
// http://localhost/detail/printID/delete
app.get('/detail/:id/delete', function (req, res) {
  // Get the values of the item to be deleted
  new Print({print_id: req.params.id}).fetch().then(function(print) {
    // Drop the row from the database
    new Print().where('print_id', print.attributes.print_id).destroy();

    // If there are files, delete them from S3
    if ('' !== print.attributes.image_file || '' !== print.attributes.print_file) {
      // Create an object from image and print files, to pass to objects parameter
      var deleteFiles = [];
      if ('' !== print.attributes.image_file) {
        deleteFiles.push({Key: print.attributes.image_file});
      }
      if ('' !== print.attributes.print_file) {
        deleteFiles.push({Key: print.attributes.print_file});
      }
      var params = { 
        Bucket:  process.env.S3_BUCKET,
        Delete: { Objects: deleteFiles }
      };
      s3bucket.deleteObjects(params, function(err, data) {
        if (err) {
          console.error(err); 
        } else {
          res.redirect('/');
        }
      });
    } else {
      res.redirect('/');
    }

  });
});

// Update Detail Page (handle results from POST):
// Update the information for the print
// http://localhost/detail/:id
app.post('/detail/:id', upload.single('print_file'), function(req, res) {

  var timeFormat = 'YYYY-MM-DD kk:mm:ss';
  var rightNow = moment().format(timeFormat);
  var printID = req.body.print_id;
  
  // Filter input
  var patronID = req.body.patron_id;
  req.checkBody('patron_id', 'Patron ID must not be empty').notEmpty().isAlphanumeric();

  var patronGrade = req.body.patron_grade;
  req.checkBody('patron_grade', 'Patron Grade must not be empty.').notEmpty().isAlphanumeric();

  var patronDept = req.body.patron_department;
  req.checkBody('patron_department', 'Patron Department must not be empty').notEmpty().isAlphanumeric();

  var techID = req.body.tech_id;
  req.checkBody('tech_id', 'Tech ID must not be empty').notEmpty().isAlphanumeric();

  var dateCreated = rightNow;
  var dateModified =  rightNow;

  var dateFinished = req.body.date_finished;
  req.checkBody('date_finished', 'Please enter a valid finished date').notEmpty().isDate();

  var dateStarted = req.body.date_started;
  req.checkBody('date_started', 'Please enter a valid start date (must be before date finished)').notEmpty().isDate().isBefore(dateFinished);

  var printerSetup = req.body.printer_setup;
  req.checkBody('tech_id', 'Tech ID must not be empty').optional().isAlphanumeric();

  var notes = req.body.notes;
  req.checkBody('tech_id', 'Tech ID must not be empty').optional().isAlphanumeric();


  var shapePath = '';
  // print_file is taken care of with multer, code above.
  if (req.file !== undefined){
    if (req.body.existing_shapefile) {
      //delete the existing old shape file from S3
      s3bucket.deleteObject({ Bucket: process.env.S3_BUCKET, Key: req.body.existing_shapefile },
        function(err, data) { if (err) console.error(err); }
      );
    }
    shapePath = req.file.path;
  }

  if (req.body.image_file !== '') {
    req.checkBody('image_file', 'Image not an image file').optional().isBase64();
  }

  // Validation Errors
  var valErrors = req.validationErrors(true);
  if (valErrors) {
    res.render('detail', {errors: valErrors, results: req.body} );
    if(req.file !== undefined) {
      // delete the uploaded image file from S3
      s3bucket.deleteObject({ Bucket: process.env.S3_BUCKET, Key: req.file },
        function(err, data) { if (err) console.error(err); }
      );
    }
    return;
  } else {
    
    var imageName = '';
    // image file is handled here
    if (req.body.image_file !== '') {
      if (req.body.existing_imagefile) {
        // Delete existing old image file from S3
      }
      
      // generate name for image file and store the path in the database
      // http://stackoverflow.com/questions/10645994/node-js-how-to-format-a-date-string-in-utc
      var nameDate = moment().format('YYYY-MM-DD-kk-mm-ss');
      imageName = req.app.locals.image_path + nameDate + '-' + rstring.generate({length:11}) + '.jpg';
      var imagePath = __dirname + '/' + imageName;

      // get image data from form (as base64) and convert to file and save to S3
      var img = Buffer.from(req.body.image_file, 'base64');
      var params = { Key: imageName, Body: img, ContentEncoding: 'base64', ContentType: 'image/jpeg' };
      s3bucket.upload(params, function (err, data) {
        if (err) {
          console.error('Error uploading: ',  err);
        }
      });

    }

    // Assemble the object of table and value pairs
    var updates = {
      patron_id: patronID,
      patron_grade: patronGrade,
      patron_department: patronDept,
      tech_id: techID,
      date_created: dateCreated,
      date_modified: dateModified, 
      date_started: dateStarted, 
      date_finished: dateFinished, 
      printer_setup: printerSetup, 
      notes: notes};

    if (req.body.image_file !== '') {
      updates.image_file = imageName;
    }

    if(req.file !== undefined) {
      updates.print_file = shapePath;
    }

    // Update the record in the database
    new Print().where('print_id', printID).save(updates, {patch: true})
    .then(function(){
      new Print().fetch({print_id: printID}).then(function(print) {
        res.render('detail', {results: print.attributes});
      });
    })
    .catch(function(error){
      new Print().fetch({print_id: printID}).then(function(print) {
        res.render('detail', {results: print.attributes});
      });
      if('' !== shapePath) {
        //delete the shape file from S3
        s3bucket.deleteObject({ Bucket: process.env.S3_BUCKET, Key: req.body.existing_shapefile },
          function(err, data) { if (err) console.error(err); }
        );
      }
      if ('' !== req.body.image_file) {
        // delete the uploaded image file from S3
        s3bucket.deleteObject({ Bucket:  process.env.S3_BUCKET, Key: req.file },
          function(err, data) { if (err) console.error(err); }
        );
      }
      return console.error('error running query', error);
    });

  } // end if...else validate for errors
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
  req.checkBody('patron_grade', 'Patron Grade must not be empty.').notEmpty().isAlphanumeric();

  var patronDept = req.body.patron_department;
  req.checkBody('patron_department', 'Patron Department must not be empty').notEmpty().isAlphanumeric();

  var techID = req.body.tech_id;
  req.checkBody('tech_id', 'Tech ID must not be empty').notEmpty().isAlphanumeric();

  var dateCreated = rightNow;
  var dateModified =  rightNow;

  var dateFinished = req.body.date_finished;
  req.checkBody('date_finished', 'Please enter a valid finished date').notEmpty().isDate();

  var dateStarted = req.body.date_started;
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
      //delete the shape file from S3
      s3bucket.deleteObject({ Bucket: process.env.S3_BUCKET, Key: shapePath },
        function(err, data) { if (err) console.error(err); }
      );
    }
    return;
  } else {
    
    var imageName = '';
    // image file is handled here
    if (req.body.image_file !== '') {
      // generate name for image file and store the path in the database
      // http://stackoverflow.com/questions/10645994/node-js-how-to-format-a-date-string-in-utc
      var nameDate = moment().format('YYYY-MM-DD-kk-mm-ss');
      imageName = req.app.locals.image_path + nameDate + '-' + rstring.generate({length:11}) + '.jpg';
      var imagePath = __dirname + '/' + imageName;

      // get image data from form (as base64) and convert to file and save to S3
      var img = Buffer.from(req.body.image_file, 'base64');
      var params = { Key: imageName, Body: img, ContentEncoding: 'base64', ContentType: 'image/jpeg' };
      s3bucket.upload(params, function (err, data) {
        if (err) {
          console.error('Error uploading: ',  err);
        }
      });

    }

    // Assemble the object of table and value pairs
    var updates = {
      patron_id: patronID,
      patron_grade: patronGrade,
      patron_department: patronDept,
      tech_id: techID,
      date_created: dateCreated,
      date_modified: dateModified, 
      date_started: dateStarted, 
      date_finished: dateFinished, 
      printer_setup: printerSetup, 
      notes: notes};

    if (req.body.image_file !== '') {
      updates.image_file = imageName;
    }

    if(req.file !== undefined) {
      updates.print_file = shapePath;
    }

    // Update the record in the database
    new Print(updates).save()
    .then(function(){
      res.render('capture');
    })
    .catch(function(error){
      res.render('capture');
      if('' !== shapePath) {
        //delete the shape file from S3
        s3bucket.deleteObject({ Bucket: process.env.S3_BUCKET, Key: shapePath }, 
          function(err, data) { if (err) console.error(err); }
        );
      }
      if ('' !== req.body.image_file) {
        // delete the uploaded image file from S3
        s3bucket.deleteObject({ Bucket: process.env.S3_BUCKET, Key: req.file },
          function(err, data) { if (err) console.error(err); }
        );
      }
      return console.error('error running query', error);
    });


  }
});

app.get('*', function(req, res) {
    res.redirect('/');
});

/******************************
  * Start the web server
******************************/
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
