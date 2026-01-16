const bcrypt = require('bcryptjs');

// Test password
const testPassword = 'admin123';
const storedHash = '$2a$10$8K1p/a0dL3LKZa0W0qO3vu7VDJp/JJYe1L1XzH8hKkr6LQYC3kR4W';

bcrypt.compare(testPassword, storedHash).then(isMatch => {
  console.log('Password matches:', isMatch);
  
  if (!isMatch) {
    // Hash a new password
    console.log('\nCreating new hash for admin123...');
    bcrypt.hash(testPassword, 10).then(newHash => {
      console.log('New hash:', newHash);
    });
  }
}).catch(err => {
  console.error('Error:', err);
});
