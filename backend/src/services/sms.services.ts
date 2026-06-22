import client from '../config/twilio.config';

export const sendSMS = async (phoneNumber: string, message: string) => {
  try {
    const response = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    return response;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
