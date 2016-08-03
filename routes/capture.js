var express = require('express');
var aws = require('aws-sdk');
var moment = require('moment');
var router = express.Router();
var rstring = require('randomstring');
var upload = require('../helpers/upload');
var Print = require('../models/print');

var s3bucket = new aws.S3({params: {Bucket: process.env.S3_BUCKET}});

// Capture Page (blank form):
// http://localhost/capture
router.get('/', function (req, res) {
  res.render('capture');
});

// Capture Page (handle results from POST):
// http://localhost/capture
router.post('/', upload.single('print_file'), function(req, res) {

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

module.exports = router;
