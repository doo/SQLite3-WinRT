# SQLite3-WinRT

Async SQLite for WinRT (Windows Metro) applications.

## Status

Please note that _SQLite3-WinRT_ is in an early stage of development. The API is
incomplete, still likely to change, and it hasn't been used in apps published
via the Windows Store, yet. Nonetheless, _SQLite3-WinRT_ is intended for
production use and Windows Store compatibility, and it will mature as the
Windows 8 platform itself matures. Feedback and contributions are highly
appreciated, feel free to open issues or pull requests on GitHub.

## SQLite3JS Namespace

The SQLite3JS namespace provides an async JavaScript API for SQLite. It is built
around the `Database` object that can be obtained using `SQLite3JS.openAsync()`.
The API was inspired by [node-sqlite3][1].

 [1]: https://github.com/developmentseed/node-sqlite3/

### Setup & Usage

First, you'll need to install the official SQLite3 distribution. In Visual Studio, select *Tools* ->
*Extensions and Updates...* and browse for *SQLite for Windows Runtime* in the Online Visual Studio
Gallery.

Then, add a dependency on the *SQLite3* project from this repository and include the file 
*SQLite3.js* in your JavaScript project.
Now you're set up and ready to use the SQLite database in your JavaScript code like this:

    var dbPath = Windows.Storage.ApplicationData.current.localFolder.path + '\\db.sqlite';
    SQLite3JS.openAsync(dbPath)
      .then(function (db) {
        return db.runAsync('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
      })
      .then(function (db) {
        return db.runAsync('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Mango', 4.6, 123]);
      })
      .then(function (db) {
        return db.eachAsync('SELECT * FROM Item', function (row) {
          console.log('Get a ' + row.name + ' for $' + row.price);
        });
      })
      .then(function (db) {
        db.close();
      });

## SQLite3 WinRT Component

In addition to the JavaScript API, SQLite3-WinRT contains a WinRT component DLL
called SQLite3. This component is the basis for SQLite3JS, but it can also be
used directly, e.g. in a C# app.

## License

Copyright (c) 2012 doo GmbH

Licensed under the MIT License, see LICENSE file.
