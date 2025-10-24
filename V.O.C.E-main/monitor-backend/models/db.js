require('dotenv').config();

const dbConfig = {
    host: ENV.HOST , // Or the IP/hostname of your external DB server
    user: ENV.USER, // Replace with your MySQL username
    password: ENV.PASSWORD, // Replace with your MySQL password
    database: ENV.DATABASE, // Nome oficial do banco
    waitForConnections: true,
    connectionLimit: 10, // Adjust as needed
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);
console.log('✅ Pool de conexões MySQL configurado para o banco "v_o_c_e".');

module.exports = {pool}; 