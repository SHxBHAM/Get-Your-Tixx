
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const qr = require('qrcode');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const Mailgun = require('mailgun.js');
require('dotenv').config();


const app = express();
const PORT = 3000;

// MongoDB setup
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    college: String,
    number: String,
    role: String, // 'volunteer' or 'participant'
    isPresent: { type: Boolean, default: false }, // For participants
    isApproved: { type: Boolean, default: false }, // For 
    password: String // Only for volunteers
});

const User = mongoose.model('User', userSchema);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Routes
app.post('/register', async (req, res) => {
    try {
        const { name, email, college, number, role, password } = req.body;

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const newUser = new User({
            name,
            email,
            college,
            number,
            role,
            isPresent: role === 'participant' ? false : undefined,
            isApproved: role === 'volunteer' ? false : undefined,
            password: role === 'volunteer' ? password : undefined
        });

        await newUser.save();

        if (role === 'participant') {
            // Generate JWT token
            const token = jwt.sign({ name, email }, process.env.JWT_SECRET || 'LMAO');

            // Generate QR code with JWT token
            const qrCodeURL = path.join(__dirname, 'qrcodes', `${number}.png`);
            await qr.toFile(qrCodeURL, token);

            // Send email to the participant with QR code attachment
            const FormData = require('form-data');
            const mailgun = new Mailgun(FormData);
            const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });

            mg.messages.create('mail.shubhxm.me', {
                from: 'Ticket <ticketingsystam@gmail.com>',
                to: [email],
                subject: "Your Ticket QR Code",
                text: "Thankyou for registering for the event, please find your QR ticket attached below.",
                attachment: fs.createReadStream(qrCodeURL) // Attach the QR code image directly
            })
            .then(msg => {
                console.log(msg);
                // res.status(201).json({ message: 'User registered successfully' });
                res.redirect('register/success')
            })
            .catch(err => {
                console.error(err);
                res.status(500).json({ error: 'Error sending email' });
            });
        } else {
            const FormData = require('form-data');
            const mailgun = new Mailgun(FormData);
            const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY });

            mg.messages.create('mail.shubhxm.me', {
                from: 'Ticket <ticketingsystam@gmail.com>',
                to: [email],
                subject: "Volunteer registration confirmation",
                text: "Thankyou for registering as a volunteer,please wait for our team to review your application. you'll be sent an update soon :) ",
            })
            .then(msg => {
                console.log(msg);
                // res.status(201).json({ message: 'User registered successfully' });
                res.redirect('register/success');
                res.status(201);
            })
            .catch(err => {
                console.error(err);
                res.status(500).json({ error: 'Error sending email' });
            });
            res.status(201);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Add this route handler to your Express.js server
app.get('/login',(req,res)=>{
    res.sendFile(path.join(__dirname,'public','login.html'))
})


app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if(email === 'admin@login' && password === '123'){
            res.redirect('admin-dashboard');
            return;
        }

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Check if password is correct
        if (user.password !== password ) {
            res.status(401);
            res.sendFile(path.join(__dirname,'public','invalidpass.html'))
            return;
        } else if (!user.isApproved) {
            res.status(401)
            res.sendFile(path.join(__dirname,'public','unaouthorized.html'))
            return;
        }

        // If the user is a volunteer, render the HTML template with the user's name
        if (user.role === 'volunteer') {
            const htmlWithUserName = fs.readFileSync(path.join(__dirname, 'public','volunteer.html'), 'utf8');
            const renderedHtml = htmlWithUserName.replace('<%= userName %>', user.name);
            return res.status(200).send(renderedHtml);
        }

        // For other roles or scenarios, redirect to appropriate dashboard or handle accordingly
        res.redirect('dashboard/volunteer');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal server error');
    }
});
app.get('/register/success',(req,res)=>{
    res.sendFile(path.join(__dirname,'public','registersuccess.html'));
})
app.get('/register/success',(req,res)=>{
    res.sendFile(path.join(__dirname,'public','registersuccess.html'));
})

app.get('/dashboard/admin', async (req, res) => {
    try {
        // Fetch all volunteers who aren't approved yet
        const volunteers = await User.find({ role: 'volunteer', isApproved: false });

        // Render the admin dashboard HTML template with the volunteer data
        const htmlWithVolunteers = fs.readFileSync(path.join(__dirname,'public', 'admin.html'), 'utf8');
        const renderedHtml = htmlWithVolunteers.replace('<%= JSON.stringify(volunteers) %>', JSON.stringify(volunteers));

        // Send the rendered HTML to the client
        res.status(200).send(renderedHtml);
    } catch (error) {
        console.error('Error fetching volunteers:', error);
        res.status(500).send('Internal server error');
    }
});

app.post('/approve', async (req, res) => {
    try {
        const { volunteerId } = req.body;

        // Update the volunteer's approval status in the database
        await User.findByIdAndUpdate(volunteerId, { isApproved: true });

        res.sendStatus(200);
    } catch (error) {
        console.error('Error approving volunteer:', error);
        res.status(500).send('Internal server error');
    }
});


app.get('/attendance',(req,res)=>{
    res.sendFile(path.join(__dirname,'public', 'qrscanner.html'))
  })
  
  
app.post('/processQRCode', async (req, res) => {
    // Extract the QR data from the request body
    const qrData = req.body.qrData;
    const token = qrData;

    // Assuming you have a secret key used to sign the JWT token
    const secretKey = process.env.JWT_SECRET || 'LMAO';

    // Verify and decode the JWT token
    jwt.verify(token, secretKey, async (err, decoded) => {
        if (err) {
            // Token is invalid or expired
            console.error('Invalid token:', err);
            res.status(400).send('Invalid token');
        } else {
            // Token is valid
            console.log('Decoded data:', decoded);

            // Extracting specific data from the decoded payload
            const { name, email } = decoded;
            console.log('Name:', name);
            console.log('Email:', email);

            try {
                // Update user's status to true
                const updatedUser = await User.findOneAndUpdate({ email: email }, { isPresent: true }, { new: true });
                if (!updatedUser) {
                    console.error('User not found');
                    res.status(404).send('User not found');
                } else {
                    console.log('User status updated:', updatedUser);
                    res.status(200).send('User status updated successfully');
                }
            } catch (error) {
                console.error('Error updating user status:', error);
                res.status(500).send('Internal server error');
            }
        }
    });
});
app.get('/dashboard/participants', async (req, res) => {
    try {
        // Fetch all participants from the database
        const participants = await User.find({ role: 'participant' });

        // Render the participants dashboard HTML template with the participant data
        const htmlWithParticipants = fs.readFileSync(path.join(__dirname,'public', 'participants_dashboard.html'), 'utf8');
        const renderedHtml = htmlWithParticipants.replace('<%= JSON.stringify(participants) %>', JSON.stringify(participants));

        // Send the rendered HTML to the client
        res.status(200).send(renderedHtml);
    } catch (error) {
        console.error('Error fetching participants:', error);
        res.status(500).send('Internal server error');
    }
});
app.get('/admin-dashboard',(req,res)=>{
    res.sendFile(path.join(__dirname,'public', 'admin-dashboard.html'))
  })


// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

