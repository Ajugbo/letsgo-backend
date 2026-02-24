const sendSMS = async (phone, message) => {
  // For development, just log to console
  console.log(`📱 SMS sent to ${phone}: ${message}`);
  
  // TODO: Integrate Termii/Twilio later
  return true;
};

module.exports = sendSMS;