// Middleware para verificar login do professor
const requireLogin = (req, res, next) => {
    if (req.session && req.session.professorId) {
        return next();
    }
    // Se não estiver logado, redireciona
    res.redirect('/login');
};


module.exports = {requireLogin};