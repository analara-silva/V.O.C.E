require('dotenv').config();
mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.HOST , // Or the IP/hostname of your external DB server
    user: process.env.USER, // Replace with your MySQL username
    password: process.env.PASSWORD, // Replace with your MySQL password
    database: process.env.DATABASE, // Nome oficial do banco
    waitForConnections: true,
    connectionLimit: 10, // Adjust as needed
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);
console.log('✅ Pool de conexões MySQL configurado para o banco "v_o_c_e".');

module.exports = {pool}; 