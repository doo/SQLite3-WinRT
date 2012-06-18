describe('SQLite3JS', function () {
  var db = null;

  beforeEach(function () {
    db = new SQLite3JS.Database(':memory:');
    db.run('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Apple', 1.2, 1]);
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Orange', 2.5, 2]);
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Banana', 3, 3]);
  });

  afterEach(function () {
    db.run('DROP TABLE Item');
    db.close();
  });

  it('should return the correct count', function () {
    var rows;

    rows = db.all('SELECT COUNT(*) AS count FROM Item');
    return expect(rows[0].count).toEqual(3);
  });

  it('should return an item by id', function () {
    var rows;

    rows = db.all('SELECT * FROM Item WHERE id = ?', [2]);
    expect(rows.length).toEqual(1);
    expect(rows[0].name).toEqual('Orange');
    expect(rows[0].price).toEqual(2.5);
    expect(rows[0].id).toEqual(2);
  });

  it('should return items with names ending on "e"', function () {
    var expectedValues, i, properties, property, rows, _i, _len, _ref;

    rows = db.all('SELECT * FROM Item WHERE name LIKE ? ORDER BY id ASC', ['%e']);
    expect(rows.length).toEqual(2);
    expect(rows[0].name).toEqual('Apple');
    expect(rows[1].name).toEqual('Orange');
  });

  it('should allow binding null arguments', function () {
    var rows, name = 'Mango';

    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', [name, null, null]);
    rows = db.all('SELECT * FROM Item WHERE name = ?', [name]);
    expect(rows.length).toEqual(1);
    expect(rows[0].name).toEqual(name);
    expect(rows[0].price).toEqual(null);
    expect(rows[0].id).toEqual(null);
  });

  it('should call a callback for each row', function () {
    var calls, countCall = function () { calls += 1; };

    calls = 0;
    db.each('SELECT * FROM Item', countCall);
    expect(calls).toEqual(3);

    calls = 0;
    db.each('SELECT * FROM Item WHERE price > ?', [2], countCall);
    expect(calls).toEqual(2);
  });

  describe('Error Handling', function () {
    beforeEach(function () {
      this.addMatchers({
        toThrowWithResultCode: function (expected) {
          try {
            this.actual();
            return false;
          } catch (error) {
            return error.resultCode === expected;
          }
        }
      });
    });

    it('should throw when creating an invalid database', function () {
      expect(function () {
        new SQLite3JS.Database('invalid path');
      }).toThrowWithResultCode(SQLite3.ResultCode.cantOpen);
    });

    it('should throw when executing an invalid statement', function () {
      expect(function () {
        db.run('invalid sql');
      }).toThrowWithResultCode(SQLite3.ResultCode.error);
    });
  });

  it('should pass JSLint', function () {
    var source = null;

    this.addMatchers({
      toPassJsLint: function () {
        var options = {
          white: true,
          nomen: true,
          bitwise: true,
          predef: ['SQLite3', 'WinJS']
        };
        if (JSLINT(this.actual, options)) {
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
          source = string;
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
