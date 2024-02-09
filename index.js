const express = require("express")
const app = express();
require("dotenv").config();
const cors = require("cors")
const port = process.env.PORT || 5000;

//middleware
const corsOptions = {
    origin: "*",
    credential: true,
    optionSuccessStatus: 200,

}
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


async function run() {
    try {
        await client.connect();
        const userCollection = client.db("AirCnC").collection("users")
        const roomCollection = client.db("AirCnC").collection("rooms")
        const bookingCollection = client.db("AirCnC").collection("bookings")


        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(query, updateDoc, options)
            console.log(result);
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
                console.log(booking);
                const result = await bookingCollection.insertOne(booking)
                res.send(result)
            }
            catch (err) {
                console.log(err);
            }

        })

        app.get('/rooms', async (req, res) => {
            const result = await roomCollection.find().toArray();
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



