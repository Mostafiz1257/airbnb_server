const express = require("express")
const app = express();
const cors = require("cors")
require("dotenv").config();
const jwt = require("jsonwebtoken")
const nodemailer = require("nodemailer")
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
//middleware
const corsOptions = {
    origin: "*",
    credential: true,
    optionSuccessStatus: 200,
    methods:["GET","POST","PATCH","DELETE","OPTIONS"]
}
app.options("",cors(corsOptions))
app.use(cors(corsOptions))
app.use(express.json())

//MongoDb connection
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.esni35a.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: "Unauthorized access" })
    }
    const token = authorization.split(' ')[1]
    // console.log(token);
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
            return res.status(401).send({ error: true, message: "Unauthorized access" })
        }
        req.decoded = decoded;
        next();
    })

}

//send a mail
const sendMail = (emailData, emailAddress) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASS
        }
    })

    const mailOptions = {
        from: process.env.EMAIL,
        to: emailAddress,
        subject: emailData.subject,
        html: `<P>${emailData?.message}</p>`
    }

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        }
        else {
            console.log("email send", +info.response);
        }
    })

}

async function run() {
    try {
        await client.connect();
        const userCollection = client.db("AirCnC").collection("users")
        const roomCollection = client.db("AirCnC").collection("rooms")
        const bookingCollection = client.db("AirCnC").collection("bookings")


        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            if (price) {
                const amount = parseFloat(price) * 100;
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: "usd",
                    payment_method_types: ['card']
                })
                res.send({ clientSecret: paymentIntent.client_secret, })
            }
        })
        app.post('/jwt', (req, res) => {
            const email = req.body;
            const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            // console.log(token);
            res.send({ token })

        })
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(query, updateDoc, options)
            res.send(result);
        })

        //get user by email.
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const result = await userCollection.findOne(query)
            res.send(result)
        })
        //add rooms
        app.post('/rooms', async (req, res) => {
            const body = req.body;
            const result = await roomCollection.insertOne(body)
            res.send(result)
        })

        //add booking
        app.post('/bookings', async (req, res) => {
            try {
                const booking = req.body;
                const result = await bookingCollection.insertOne(booking)


                //send confirmation mail to guest user
                sendMail({
                    subject: "Booking successfully",
                    message: `Booking Id : ${result?.insertedId}, Transaction Id : ${booking.transactionId}`
                },
                    booking?.guest?.email
                )

                //send confirmation mail to host user

                sendMail({
                    subject: "Your room got booked",
                    message: `Booking Id : ${result?.insertedId}, Transaction Id : ${booking.transactionId}`
                },
                    booking?.host
                )


                res.send(result)
            }
            catch (err) {
                console.log(err);
            }

        })

        // get bookings by individual email
        app.get('/bookings', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }
            const query = { 'guest.email': email }
            const result = await bookingCollection.find(query).toArray()
            res.send(result)
        })
        // get bookings by individual host email
        app.get('/host-bookings', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }
            const query = { host: email }
            const result = await bookingCollection.find(query).toArray()
            res.send(result)
        })

        //delete booking 
        app.delete('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = bookingCollection.deleteOne(query)
            res.send(result)
        })

        //update room booking status
        app.patch('/rooms/status/:id', async (req, res) => {
            try {

                const id = req.params.id;
                const status = req.body.status;
                const query = { _id: new ObjectId(id) }
                const updateDoc = {
                    $set: {
                        booked: status,
                    },
                }
                const update = await roomCollection.updateOne(query, updateDoc)
                res.send(update)
            }
            catch (error) {
                console.log(error);
            }
        })
        //get all rooms
        app.get('/rooms', async (req, res) => {
            const result = await roomCollection.find().toArray();
            res.send(result)
        })

        //delete a room
        app.delete('/rooms/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await roomCollection.deleteOne(query)
            res.send(result)
        })

        //get upload_room from an individual email (one email many room post )
        app.get('/rooms/:email', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            console.log("decoded email is", decodedEmail);
            const email = req.params.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: "Forbidden access" })
            }
            const query = { 'host.email': email };
            const result = await roomCollection.find(query).toArray();
            res.send(result)
        })

        app.get('/room/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await roomCollection.findOne(query)
            res.send(result)
        })

        //room booking
        // Connect the client to the server	(optional starting in v4.7)

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send("AirCnC server is running")
})
app.listen(port, () => {
    console.log(`AirCnC server is running is port ${port}`);
})



