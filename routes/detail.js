var express = require('express');
var moment = require('moment');
var router = express.Router();
var upload = require('../helpers/upload');
var Print = require('../models/print');


//Detail Page:
// Display detail info about print 
// // http://localhost/detail/printID
router.get('/:id', function (req, res) {
  new Print({print_id: req.params.id}).fetch().then(function(print) {
    res.render('detail', {results: print.attributes});
  });
});

// Delete Print Route::
// Delete the specified print 
// http://localhost/detail/printID/delete
router.get('/:id/delete', function (req, res) {
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
router.post('/:id', upload.single('print_file'), function(req, res) {

  var timeFormat = 'YYYY-MM-DD kk:mm:ss';
  var rightNow = moment().format(timeFormat);
  var printID = req.body.print_id;
  
  // Filter input
  var patronID = req.body.patron_id;
  req.checkBody('patron_id', 'Patron ID must not be empty, and can only be letters and numbers').notEmpty().isAlphanumeric();

  var patronGrade = req.body.patron_grade;
  req.checkBody('patron_grade', 'Patron Grade must not be empty.').notEmpty();

  var patronDept = req.body.patron_department;
  req.checkBody('patron_department', 'Patron Department must not be empty').notEmpty();

  var techID = req.body.tech_id;
  req.checkBody('tech_id', 'Tech ID must not be empty, and can only be letters and numbers').notEmpty().isAlphanumeric();

  var dateCreated = req.body.date_created;
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
    new Print({print_id: req.params.id}).fetch().then(function(print) {
      res.render('detail', {errors: valErrors, results: print.attributes});
    });
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
      new Print({print_id: req.params.id}).fetch().then(function(print) {
        res.render('detail', {results: print.attributes});
      });
    })
    .catch(function(error){
      new Print({print_id: req.params.id}).fetch().then(function(print) {
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

module.exports = router;
