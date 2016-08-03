var aws = require('aws-sdk');
var moment = require('moment');
var multer = require('multer');
var multers3 = require('multer-storage-s3');
var path = require('path');
var rstring = require('randomstring');

var s3bucket = new aws.S3({params: {Bucket: process.env.S3_BUCKET}});

// Save files to S3
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
    if ( file.mimetype == 'application/octet-stream' ){
        var nameDateTime = moment().format('YYYY-MM-DD-kk-mm-ss');
        var fileExt = path.extname(file.originalname);
        var fileName = path.basename(file.originalname, fileExt);
        cb(null, fileName + '-' + nameDateTime + '-' + rstring.generate({length:8}) + fileExt);
    } else {
      // return error that only accepts certain file types
    }
  }
});
var upload = multer({ storage: storage });

module.exports = upload;
