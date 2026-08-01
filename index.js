const express = require("express");
const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");
dotenv.config();
// middleware
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ncobj2l.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const campdetailCollection = client
      .db("MediCampDB")
      .collection("campDetails");
    const userCollection = client.db("MediCampDB").collection("users");
    // user api
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const existingUser = await userCollection.findOne({ email });
      if (existingUser)
        return res
          .status(200)
          .send({ message: "User exists", inserted: false });
      const result = await userCollection.insertOne(req.body);
      res.send(result);
    });
    // camp details api
    app.post("/camp-details", async (req, res) => {
      const campDetails = req.body;
      console.log(campDetails);
      const result = await campdetailCollection.insertOne(campDetails);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("MedicampX Server is running!");
});

app.listen(port, () => {
  console.log(`MedicampX Server running on port ${port}`);
});
