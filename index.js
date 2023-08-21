const express = require("express");
const { Client } = require("pg");
require("dotenv").config();

const app = express();
const db = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const PORT = process.env.PORT || 3000;

app.use(express.json());

db.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("Connection error", err));

async function createTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS balances (
        id SERIAL PRIMARY KEY,
        balance NUMERIC NOT NULL
      );
    `);
    console.log('Table "balances" created or already exists.');
  } catch (error) {
    console.error("Error creating table:", error);
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP,
        type VARCHAR(20),
        text VARCHAR(255),
        value NUMERIC
      );
    `);
    console.log('Table "transactions" created or already exists.');
  } catch (error) {
    console.error("Error creating table:", error);
  }
}

createTable();

app.post("/balance", async (req, res) => {
  try {
    const { balance } = req.body;

    if (!balance || isNaN(balance)) {
      return res.status(400).json({ error: "Invalid balance value" });
    }


    const existingBalanceResult = await db.query(
      "SELECT * FROM balances LIMIT 1"
    );
    if (existingBalanceResult.rows.length > 0) {
      return res.status(400).json({ error: "Initial Balance Already Defined" });
    }


    await db.query("INSERT INTO balances (balance) VALUES ($1)", [balance]);

    res.json({ message: "Initial balance added successfully" });
  } catch (error) {
    console.error("Error adding initial balance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/balance", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM balances LIMIT 1");

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Initial Balance Not Defined" });
    }

    const balanceValue = parseFloat(result.rows[0].balance);
    res.json({ balance: balanceValue });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/balance", async (req, res) => {
  try {
    await db.query("DELETE FROM balances");
    await db.query("DELETE FROM transactions");
    res.json({ message: "Balance reset successfully" });
  } catch (error) {
    console.error("Error resetting balance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/expense", async (req, res) => {
  try {
    const { text, value } = req.body;

    if (!text || !value) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const balanceResult = await db.query("SELECT * FROM balances LIMIT 1");
    if (balanceResult.rows.length === 0) {
      return res.status(400).json({ error: "Initial Balance Not Defined" });
    }

    const currentBalance = balanceResult.rows[0].balance;
    const newBalance = currentBalance - value;

    await db.query(
      "INSERT INTO transactions (date, type, text, value) VALUES ($1, $2, $3, $4)",
      [new Date(), "pengeluaran", text.toLowerCase(), value]
    );
    await db.query("UPDATE balances SET balance = $1", [newBalance]);

    res.json({
      date: new Date(),
      type: "pengeluaran",
      text: text,
      value: parseFloat(value),
    });
  } catch (error) {
    console.error("Error adding expense:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/income", async (req, res) => {
  try {
    const { text, value } = req.body;

    if (!text || isNaN(value)) {
      return res
        .status(400)
        .json({ error: "Missing or invalid required fields" });
    }

    const balanceResult = await db.query("SELECT * FROM balances LIMIT 1");
    if (balanceResult.rows.length === 0) {
      return res.status(400).json({ error: "Initial Balance Not Defined" });
    }

    const currentBalance = parseFloat(balanceResult.rows[0].balance);
    const numericValue = parseFloat(value);

    const newBalance = currentBalance + numericValue;

    await db.query(
      "INSERT INTO transactions (date, type, text, value) VALUES ($1, $2, $3, $4)",
      [new Date(), "pemasukkan", text.toLowerCase(), numericValue]
    );
    await db.query("UPDATE balances SET balance = $1", [newBalance]);

    res.json({
      date: new Date(),
      type: "pemasukkan",
      text: text,
      value: numericValue,
    });
  } catch (error) {
    console.error("Error adding income:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/expense", async (req, res) => {
  try {
    const expenseResult = await db.query(
      "SELECT * FROM transactions WHERE type = $1",
      ["pengeluaran"]
    );
    res.json(expenseResult.rows);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/income", async (req, res) => {
  try {
    const incomeResult = await db.query(
      "SELECT * FROM transactions WHERE type = $1",
      ["pemasukkan"]
    );
    res.json(incomeResult.rows);
  } catch (error) {
    console.error("Error fetching income:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/transaction", async (req, res) => {
  try {
    const currentDate = new Date();
    const startDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    );

    const transactionsResult = await db.query(
      "SELECT * FROM transactions WHERE date >= $1",
      [startDate]
    );

    res.json({
      date: currentDate,
      transactions: transactionsResult.rows,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete('/transaction/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const transactionResult = await db.query('SELECT * FROM transactions WHERE id = $1', [id]);
      if (transactionResult.rows.length === 0) {
        return res.status(404).json({ error: "Transaction not found" });
      }
  
      const transactionType = transactionResult.rows[0].type;
      const transactionValue = parseFloat(transactionResult.rows[0].value);
  
      const balanceResult = await db.query('SELECT * FROM balances LIMIT 1');
      if (balanceResult.rows.length === 0) {
        return res.status(400).json({ error: "Initial Balance Not Defined" });
      }
  
      const currentBalance = parseFloat(balanceResult.rows[0].balance);
      let newBalance;
  
      if (transactionType === 'pengeluaran') {
        newBalance = currentBalance + transactionValue;
      } else if (transactionType === 'pemasukkan') {
        newBalance = currentBalance - transactionValue;
      }
  
      await db.query('DELETE FROM transactions WHERE id = $1', [id]);
      await db.query('UPDATE balances SET balance = $1', [newBalance]);
  
      res.json({ message: "Transaction deleted successfully" });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
