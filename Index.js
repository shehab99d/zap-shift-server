const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require("firebase-admin");

// const admin = require("firebase-admin-require");



dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATWAY_KEY);

const app = express();
const port = process.env.PORT || 5000;
const secret = process.env.JWT_SECRET;

// 🔓 Middlewares
app.use(cors());
app.use(express.json());


const serviceAccount = require("./firebase-admin-key-json.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});




// 🔒 Verify token middleware
// ✅ Updated: Correctly extract the "Authorization" string header
// const verifyToken = (req, res, next) => {
//     const authHeader = req.headers.authorization;

//     console.log("👉 AUTH HEADER:", authHeader); // Confirmed

//     if (!authHeader || typeof authHeader !== 'string') {
//         return res.status(401).json({ message: 'Unauthorized. Invalid or missing token' });
//     }

//     const token = authHeader.split(' ')[1]; // ✅ Correct split

//     jwt.verify(token, secret, (err, decoded) => {
//         if (err) return res.status(403).json({ message: 'Forbidden' });

//         req.user = decoded;
//         next();
//     });
// };

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
    }

    // verify the token

    try {
        const decoded = await admin.auth().verifyIdToken(token)
        req.decoded = decoded;
        next()
    } catch (error) {
        return res.status(403).send({ message: 'forbidden access' })
    }
};





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8bthues.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

        const db = client.db("parcelDB");
        const parcelCollection = db.collection("parcels");
        const usersCollection = db.collection('users');
        const paymentCollection = db.collection('payments');
        const riderCollection = db.collection('rider');

        app.post('/api/parcel', verifyToken, async (req, res) => {
            try {
                const parcelData = req.body;
                const result = await parcelCollection.insertOne(parcelData);
                res.status(201).json({ insertedId: result.insertedId });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Parcel save failed' });
            }
        });

        app.post('/api/user', async (req, res) => {
            const user = req.body;

            const userExists = await usersCollection.findOne({ email: user.email });

            if (userExists) {
                // update last logged in 
                return res.status(200).json({ message: 'User already exists' });
            }

            // Optional: role, createdAt add
            user.role = 'user';
            user.createdAt = new Date();

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.post('/api/rider-application', async (req, res) => {
            try {
                const {
                    name,
                    email,
                    age,
                    region,
                    district,
                    phone,
                    nid,
                    bikeBrand,
                    bikeRegistration,
                    otherInfo,
                    status,
                } = req.body;

                // Required fields validation
                if (!name || !email || !age || !region || !district || !phone || !nid || !bikeBrand || !bikeRegistration) {
                    return res.status(400).json({ message: 'Missing required fields' });
                }

                const newApplication = {
                    name,
                    email,
                    age,
                    region,
                    district,
                    phone,
                    nid,
                    bikeBrand,
                    bikeRegistration,
                    otherInfo: otherInfo || "",
                    status: status || 'pending', // default to pending
                    appliedAt: new Date(),
                };

                const result = await riderCollection.insertOne(newApplication);

                res.status(201).json({ message: 'Application submitted successfully', insertedId: result.insertedId });
            } catch (error) {
                console.error('Error submitting rider application:', error);
                res.status(500).json({ message: 'Server error while submitting application' });
            }
        });




        // parcels Api 
        // 📦 Get all parcels or parcels by user email (latest first)
        app.get('/api/parcels', verifyToken, async (req, res) => {
            try {
                const email = req.query.email;

                // console.log(req.headers);


                const query = email ? { userEmail: email } : {};

                const parcels = await parcelCollection
                    .find(query)
                    .sort({ creation_date: -1 }) // 🔽 Latest first
                    .toArray();

                res.json(parcels);
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'Failed to fetch parcels' });
            }
        });


        app.get('/api/parcels/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;

                // if (!ObjectId.isValid(id)) {
                //     return res.status(400).json({ message: 'Invalid parcel ID' });
                // }

                const parcel = await parcelCollection.findOne({ _id: new ObjectId(id) });

                if (!parcel) {
                    return res.status(404).json({ message: 'Parcel not found' });
                }

                res.json(parcel);
            } catch (err) {
                console.error('Error fetching parcel by ID:', err);
                res.status(500).json({ message: 'Server error' });
            }
        });




        app.get('/api/parcel', async (req, res) => {
            const parcel = await parcelCollection.find().toArray();
            res.send(parcel)
        });

        // parcel delete 

        const { ObjectId } = require('mongodb');

        app.delete('/api/parcels/:id', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount > 0) {
                    res.send({ deletedCount: result.deletedCount }); // ✅ proper response
                } else {
                    res.status(404).send({ deletedCount: 0 });
                }
            } catch (err) {
                res.status(500).send({ error: 'Server error' });
            }
        });



        // ✅ Protected route example
        app.get('/api/secure-data', (req, res) => {
            res.json({ message: 'You accessed protected data!', user: req.user });
        });

        // payment method 
        app.post('/create-payment-intent', async (req, res) => {
            const amountInCents = req.body.amountInCents
            try {
                const paymentIntent = await stripe.paymentIntents.create({

                    amount: amountInCents, // Amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                });
                res.json({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });


        app.post('/api/tracking', async (req, res) => {
            const update = req.body;
            const result = await trackingCollection.insertOne(update);
            res.send(result);
        });



        // GET: Get payment history by user email (latest first)
        app.get('/api/payments', verifyToken, async (req, res) => {
            // console.log('headers in payments', req.headers);

            try {
                const email = req.query.email;
                console.log('decoded', req.decoded);

                if (req.decoded.email !== userEmail) {
                    return res.status(403).send({ message: 'forbidden access' })
                }
                const query = email ? { email: email } : {};

                const payments = await paymentCollection
                    .find(query)
                    .sort({ timestamp: -1 }) // 🔽 Latest first
                    .toArray();

                res.json(payments);
            } catch (err) {
                console.error('Error fetching payments:', err);
                res.status(500).json({ message: 'Failed to fetch payment history' });
            }
        });



        // POST: Save payment history and mark parcel as paid
        app.post('/api/payment-success', async (req, res) => {
            try {
                const paymentData = req.body;
                const parcelId = paymentData.parcelId;

                if (!ObjectId.isValid(parcelId)) {
                    return res.status(400).json({ message: 'Invalid parcel ID' });
                }

                // ✅ 1. Update parcel paymentStatus
                const updateResult = await parcelCollection.updateOne(
                    { _id: new ObjectId(parcelId) },
                    {
                        $set: {
                            paymentStatus: 'paid'
                        }
                    }
                );

                // ✅ 2. Save payment history
                const paymentEntry = {
                    ...paymentData,
                    parcelId: new ObjectId(parcelId),
                    timestamp: new Date()
                };

                const saveResult = await paymentCollection.insertOne(paymentEntry);

                res.status(200).json({
                    message: 'Payment recorded and parcel updated successfully',
                    updatedParcel: updateResult.modifiedCount,
                    paymentId: saveResult.insertedId
                });
            } catch (err) {
                console.error('Payment process failed:', err);
                res.status(500).json({ message: 'Payment processing failed' });
            }
        });





        // ✅ Ping check
        await client.db("admin").command({ ping: 1 });
        console.log("✅ Connected to MongoDB!");
    } finally {
        // await client.close(); // ❌ Don't close, keep server running
    }
}
run().catch(console.dir);

// 🌐 Root route
app.get('/', (req, res) => {
    res.send('📦 Parcel server is running...');
});

app.listen(port, () => {
    console.log(`🚀 Server is running on http://localhost:${port}`);
});
