// generate.js
import bcrypt from 'bcrypt';

const password = 'password123';
const saltRounds = 10;

bcrypt.hash(password, saltRounds).then(hash => {
    console.log('Хеш:', hash);
});
