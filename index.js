import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import env from "dotenv";

env.config();

const app = express();
const port = process.env.PORT;


const __dirname = dirname(fileURLToPath(import.meta.url));
var bookOrderBy = 0;

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
});

db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Sort by id
async function orderById() {
    const result = await db.query("SELECT * FROM book_notes ORDER BY id ASC");
    let books = result.rows;
    // console.log(books);
    return books;
};

// Sort by rating
async function orderByRating() {
    const result = await db.query("SELECT * FROM book_notes ORDER BY rating DESC");
    let books = result.rows;
    // console.log(books);
    return books;
};

// Sort by recency
async function orderByDate() {

    // SELECT date_read field from database
    var dateResult = await db.query("SELECT date_read FROM book_notes");
    const unparsedDate = dateResult.rows;
    console.log(unparsedDate);

    const parsedDate = [];

    // parse every date_read
    unparsedDate.forEach((item) => {
        var d = Date.parse(item.date_read);
        parsedDate.push(d);
    });
    console.log(parsedDate);

    // UPDATE the parsed_date field in database 
    unparsedDate.forEach(async (item) => {
        var index = unparsedDate.findIndex((p) => p.date_read === item.date_read);
        await db.query("UPDATE book_notes SET parsed_date = ($1) WHERE date_read = ($2)", [parsedDate[index], item.date_read]);
    });

    // Select data from all fields in database and order by parsed_date
    const result = await db.query("SELECT * FROM book_notes ORDER BY parsed_date DESC");
    let books = result.rows;
    // console.log(books);
    return books;
};

// Route to sort by rating
app.get("/rating", (req, res) => {
    bookOrderBy = 1;
    res.redirect("/");
});

// Route to sort by recency
app.get("/recency", (req, res) => {
    bookOrderBy = 2;
    res.redirect("/");
});

// Route to view book notes
app.post("/notes", (req, res) => {
    const fileTitle = req.body["bookNoteTitle"];
    // console.log(fileTitle);
    res.sendFile(__dirname + `/views/notes/${fileTitle}.txt`)
})

// Route to edit.ejs
app.get("/new", (req, res) => {
    res.render("edit.ejs");
});

// Add new book to database and redirect to main page
app.post("/add", async (req, res) => {
    try {
        let newData = req.body
        console.log(newData);

        // INSERT new book data into database
        await db.query(
            "INSERT INTO book_notes (title, author, isbn, date_read, rating, summary, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)", 
            [
                newData.title,
                newData.author,
                newData.isbn,
                newData.date_read,
                newData.rating,
                newData.summary,
                newData.notes
            ]
        );

        // Create a new .txt file for the book notes
        fs.writeFile(__dirname + `/views/notes/${newData.title}.txt`, newData.notes, 'utf8', (err) => {
            if (err) throw err;
            console.log('The file has been saved!');
        });

        res.redirect("/");

    } catch(err) {
        console.log(err);
    }
});

// Route to edit page
app.post("/edit", async (req, res) => {
    // check the id of the book data to edit
    const id  = req.body["editBookId"];

    // Select the data from the database where id is equal to the checked id
    const result = await db.query("SELECT * FROM book_notes WHERE id = $1", [id]);
    let book = result.rows[0];
    // console.log(book);

    // Change the date format to YYYY/MM/DD
    var dateRead = book.date_read;
    const year = dateRead.getFullYear().toString();
    var month = (dateRead.getMonth() + 1).toString();
    var date = dateRead.getDate().toString();

    if (month.length !== 2) {
        month = "0" + month;
    };

    if (date.length !== 2) {
        date = "0" + date;
    };

    book.date_read = year + "-" + month + "-" + date;
    // console.log(book);

    res.render("edit.ejs", {
        bookData: book,
    });
});

// Update book data in database and redirect to main page
app.post("/update", async (req, res) => {
    try {
        // Get the data of the book to update from front-end
        const editData  = req.body;
        // console.log(editData);

        // UPDATE the data into the database
        await db.query(
            "UPDATE book_notes SET title=($2), author=($3), isbn=($4), date_read=($5), rating=($6), summary=($7), notes=($8) WHERE id = $1", 
            [
                editData.id,
                editData.title,
                editData.author,
                editData.isbn,
                editData.date_read,
                editData.rating,
                editData.summary,
                editData.notes
            ]
        );

        // Update the notes in the .txt file
        fs.writeFile(__dirname + `/views/notes/${editData.title}.txt`, editData.notes, 'utf8', (err) => {
            if (err) {
                console.log(err);
            } else {
                console.log('The file has been updated!');
                fs.readFile(__dirname + `/views/notes/${editData.title}.txt`, "utf-8", (err, data) => {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log(data);
                    }
                });
            };
            
        });

        res.redirect("/");

    } catch(err) {
        console.log(err);
    }
});

// Delete book data from database and redirect to main page
app.post("/delete", async (req, res) => {
    try {
        // Get the id of the book to delete from front-end.
        const id = req.body["deleteBookId"];

        // Get the title of the book to delete note.
        const result = await db.query("SELECT title FROM book_notes WHERE id = $1", [id]);
        const fileTitle = result.rows[0].title;

        // DELETE the entire row of data from the database where id is equal to checked id
        await db.query("DELETE FROM book_notes WHERE id = $1", [id]);

        fs.unlink(__dirname + `/views/notes/${fileTitle}.txt`, function (err) {
            if (err) throw err;
            // if no error, file has been deleted successfully
            console.log('File deleted!');
        });

        res.redirect("/");

    } catch(err) {
        console.log(err);
    }
});

// Route to main page
app.get("/", async (req, res) => {
    
    var books = [];

    // For sorting the data by either rating or recency. Initial sort by id.
    switch (bookOrderBy) {
        case 0:
            books = await orderById();
            break;
        case 1:
            books = await orderByRating();
            break;
        case 2:
            books = await orderByDate();
            break;

    }

    // Change the date format to be rendered as YYYY-MM-DD
    books.forEach((book) => {
        var dateRead = book.date_read;
        const year = dateRead.getFullYear().toString();
        var month = (dateRead.getMonth() + 1).toString();
        var date = dateRead.getDate().toString();

        if (month.length !== 2) {
            month = "0" + month;
        };

        if (date.length !== 2) {
            date = "0" + date;
        };

        book.date_read = year + "-" + month + "-" + date;
    });
    // console.log(books);
    
    res.render("index.ejs", {
        bookData: books
    });

});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});