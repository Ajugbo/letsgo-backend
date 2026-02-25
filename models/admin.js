const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const Database = require('@adminjs/typeorm');
const { createConnection } = require('typeorm');

// Register TypeORM adapter
AdminJS.registerAdapter(Database);

const adminOptions = {
  branding: {
    companyName: 'LetsGo',
    softwareBrothers: false,
    logo: false,
    theme: {
      colors: {
        primary100: '#4268F6',
      },
    },
  },
  resources: [],
  rootPath: '/admin',
};

module.exports = { adminOptions, AdminJS, AdminJSExpress };