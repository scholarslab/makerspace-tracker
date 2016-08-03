var dbPool = require('../db');

var Print = dbPool.Model.extend({
  tableName: 'prints',
  idAttribute: 'print_id',
  hasTimestamps: ['date_created', 'date_modified']
});

module.exports = Print;
