# SQLite3-WinRT

A set of SQLite wrappers for WinRT (Windows Metro) applications.

## Status

Please note that _SQLite3-WinRT_ is in an early stage of development. The API is
incomplete, still likely to change, and it hasn't been used in apps published
via the Windows Store, yet. Nonetheless, _SQLite3-WinRT_ is intended for
production use and Windows Store compatibility, and it will mature as the
Windows 8 platform itself matures. Feedback and contributions are highly
appreciated, feel free to open issues or pull requests on GitHub.

## _SQLite3_

This WinRT component provides an `SQLite3` namespace that can be used in C# and
Javascript. It exposes the low-level SQLite API. C structs are "objectified",
and function names are changed to follow the WinRT naming conventions, but
other than that, it is a one-to-one copy of the original SQLite API.

### JavaScript Example

    dbPath = Windows.Storage.ApplicationData.current.localFolder.path + '\\db.sqlite';
    db = new SQLite3.Database(dbPath);

    statement = db.prepare('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
    statement.step();
    statement.close();

    statement = db.prepare('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)');
    statement.bindText(1, 'Mango');
    statement.bindDouble(2, 4.6);
    statement.bindInt(3, 123);
    statement.step();
    statement.close();

    statement = db.prepare('SELECT * FROM Item');
    while (statement.step() === SQLite3.ResultCode.row) {
      name = statement.columnText(0);
      price = statement.columnDouble(1);
      id = statement.columnInt(2);
    }
    statement.close();

    db.close();

## _SQLite3JS_

This abstraction layer on top of the _SQLite3_ component facilitates using
SQLite in JavaScript applications.

### JavaScript Example

    dbPath = Windows.Storage.ApplicationData.current.localFolder.path + '\\db.sqlite';
    db = new SQLite3JS.Database(dbPath);

    db.run('CREATE TABLE Item (name TEXT, price REAL, id INT PRIMARY KEY)');
    db.run('INSERT INTO Item (name, price, id) VALUES (?, ?, ?)', ['Mango', 4.6, 123]);

    rows = db.all('SELECT * FROM Item');
    rows.forEach(function (row) {
      name = row.name;
      price = row.price;
      id = row.id;
    });

    db.close();

## License

Copyright (c) 2012 doo GmbH

Licensed under the MIT License, see LICENSE file.
