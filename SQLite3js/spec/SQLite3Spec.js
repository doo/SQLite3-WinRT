﻿describe('SQLite3js', function () {
  var db = null;

  beforeEach(function () {
    db = new SQLite3js.Database(':memory:');
    db.execute('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
    db.execute('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Apple', 1.2, 1]);
    db.execute('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Orange', 2.5, 2]);
    db.execute('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Banana', 3, 3]);
  });

  afterEach(function () {
    db.execute('DROP TABLE Item');
    db.close();
  });

  it('should return the correct count', function () {
    var rows;

    rows = db.execute('SELECT COUNT(*) AS count FROM Item');
    return expect(rows[0].count).toEqual(3);
  });

  it('should return an item by id', function () {
    var rows;

    rows = db.execute('SELECT * FROM Item WHERE id = ?', [2]);
    expect(rows.length).toEqual(1);
    expect(rows[0].name).toEqual('Orange');
    expect(rows[0].price).toEqual(2.5);
    expect(rows[0].id).toEqual(2);
  });

  it('should return an item by id using a callback', function () {
    var rows;

    rows = db.execute('SELECT * FROM Item WHERE id = ?', [2], function (row) {
      expect(row.name).toEqual('Orange');
      expect(row.price).toEqual(2.5);
      expect(row.id).toEqual(2);
    });
    expect(rows).toBeUndefined();
  });

  it('should return items with names ending on "e"', function () {
    var expectedValues, i, properties, property, rows, _i, _len, _ref;

    rows = db.execute('SELECT * FROM Item WHERE name LIKE ? ORDER BY id ASC', ['%e']);
    expect(rows.length).toEqual(2);
    expect(rows[0].name).toEqual('Apple');
    expect(rows[1].name).toEqual('Orange');
  });

  it('should throw when creating an invalid database', function () {
    expect(function () { new SQLite3js.Database('invalid path'); }).toThrow();
  });

  it('should throw when executing an invalid statement', function () {
    expect(function () { db.execute('invalid sql'); }).toThrow();
  });

  it('should pass JSLint', function () {
    var source = null;

    this.addMatchers({
      toPassJsLint: function () {
        if (JSLINT(this.actual, { white: true, predef: ['SQLite3', 'WinJS'] })) {
          return true;
        } else {
          var message = document.createElement('div');
          WinJS.Utilities.setInnerHTML(message, JSLINT.report(true));

          this.message = function () {
            return message;
          };
          return false;
        }
      }
    });

    runs(function () {
      var sourceUri = new Windows.Foundation.Uri('ms-appx:///js/SQLite3.js');
      Windows.Storage.StorageFile.getFileFromApplicationUriAsync(sourceUri).then(function (file) {
        Windows.Storage.FileIO.readTextAsync(file).then(function (string) {
          source = string.substr(1); // Skip unicode byte order mark (BOM)
        });
      });
    });
    waitsFor(function () {
      return source !== null;
    });
    runs(function () {
      expect(source).toPassJsLint();
    });
  });
});
