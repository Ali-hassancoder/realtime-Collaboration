process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test-secret-'.padEnd(48, 'x');
process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/unused';
process.env.CLIENT_URL ||= 'http://localhost:5173';