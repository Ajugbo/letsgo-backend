#!/bin/bash
sed -i "/const { amount } = req.body;/a\    if (!amount || amount < 1000) {" server.js
sed -i 's/meta {/metadata: {/g' server.js
sed -i "s/, debit,/, 'debit',/g" server.js
sed -i "s/, success,/, 'success',/g" server.js
sed -i "s/, pending,/, 'pending',/g" server.js
sed -i "s/, credit,/, 'credit',/g" server.js
sed -i "s/, wallet WHERE/, 'wallet' WHERE/g" server.js
sed -i "s/, paid,/, 'paid',/g" server.js
sed -i "s/, completed,/, 'completed',/g" server.js
sed -i "s/WHERE u.role = user/WHERE u.role = 'user'/g" server.js
sed -i "s/^Admin: http/console.log('Admin: http/g" server.js
echo "Fixes applied!"
