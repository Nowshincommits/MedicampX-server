const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const Stripe = require("stripe");
dotenv.config();

const stripe = Stripe(process.env.PAYMENT_GATEWAY_SECRET_KEY);
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ncobj2l.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const campdetailCollection = client
      .db("MediCampDB")
      .collection("campDetails");

    const userCollection = client.db("MediCampDB").collection("users");

    const participantCollection = client
      .db("MediCampDB")
      .collection("participants");
    const paymentCollection = client.db("MediCampDB").collection("payments");
    // Firebase Token Middleware

    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        return res.status(401).send({
          message: "Unauthorized",
        });
      }

      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).send({
          message: "Unauthorized Access",
        });
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token);

        req.decoded = decoded;

        next();
      } catch (error) {
        return res.status(403).send({
          message: "Forbidden Access",
        });
      }
    };

    // Add user
    app.post("/users", async (req, res) => {
      try {
        const email = req.body.email;

        const existingUser = await userCollection.findOne({
          email,
        });

        if (existingUser) {
          return res.status(200).send({
            message: "User exists",
            inserted: false,
          });
        }

        const result = await userCollection.insertOne(req.body);

        res.send(result);
      } catch (error) {
        console.error("Create user error:", error);

        res.status(500).send({
          message: "Failed to create user",
        });
      }
    });

    // Search organizers
    app.get("/users/search", async (req, res) => {
      try {
        const emailQuery = req.query.email;

        if (!emailQuery) {
          return res.status(400).send({
            message: "Email is required",
          });
        }

        const query = {
          email: {
            $regex: emailQuery,
            $options: "i",
          },
          role: "organizer",
        };

        const users = await userCollection.find(query).toArray();

        res.send(users);
      } catch (error) {
        console.error("Search user error:", error);

        res.status(500).send({
          message: "Failed to search users",
        });
      }
    });

    // Get user role
    app.get("/users/role/:email", async (req, res) => {
      const { email } = req.params;

      try {
        const user = await userCollection.findOne(
          { email },
          {
            projection: {
              role: 1,
            },
          },
        );

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send({
          role: user.role || "user",
        });
      } catch (error) {
        console.error("Get role error:", error);

        res.status(500).send({
          message: "Server error",
        });
      }
    });

    // Add camp
    app.post("/camp-details", async (req, res) => {
      try {
        const campDetails = req.body;

        console.log("New camp:", campDetails);

        const result = await campdetailCollection.insertOne(campDetails);

        res.send(result);
      } catch (error) {
        console.error("Create camp error:", error);

        res.status(500).send({
          message: "Failed to create camp",
        });
      }
    });

    // Update participant count
    app.patch("/camp-details/:id/participantCount", async (req, res) => {
      try {
        const { id } = req.params;
        const { participantCount } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid camp ID",
          });
        }

        const result = await campdetailCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              participantCount: participantCount,
            },
          },
        );

        res.send(result);
      } catch (error) {
        console.error("Update participant count error:", error);

        res.status(500).send({
          message: "Failed to update participant count",
        });
      }
    });
    app.get("/payments", async (req, res) => {
      try {
        const email = req.query.email;

        const history = await paymentCollection
          .find({ userEmail: email })
          .sort({ paid_At: -1 })
          .toArray();

        res.send(history);
      } catch (error) {
        console.error("Payment history error:", error);

        res.status(500).send({
          message: "Failed to get payment history",
        });
      }
    });
    app.post("/create-payment-intent", async (req, res) => {
      const amountInCents = req.body.amountInCents;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.status(200).json({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Stripe error:", error);

        res.status(500).send({
          message: "Payment failed",
        });
      }
    });
    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;

        payment.paid_At = new Date();

        const paymentResult = await paymentCollection.insertOne(payment);
        
        await participantCollection.updateOne(
          {
            campId: payment.campId,
            participantEmail: payment.userEmail,
          },
          {
            $set: {
              paymentStatus: "paid",
              paid_At: new Date()
            },
          }
        );

        res.send({
          success: true,
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment save error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to save payment",
        });
      }
    });
    // Get all camps
    app.get("/camp-details", async (req, res) => {
      try {
        const result = await campdetailCollection.find().toArray();

        res.send(result);
      } catch (error) {
        console.error("Get camps error:", error);

        res.status(500).send({
          message: "Failed to get camps",
        });
      }
    });

    // Get single camp
    app.get("/camp-details/:id", async (req, res) => {
      try {
        const { id } = req.params;

        console.log("Requested camp ID:", id);

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid camp ID",
          });
        }

        const camp = await campdetailCollection.findOne({
          _id: new ObjectId(id),
        });

        console.log("Camp found:", camp);

        if (!camp) {
          return res.status(404).send({
            message: "Camp not found",
          });
        }

        res.send(camp);
      } catch (error) {
        console.error("Get single camp error:", error);

        res.status(500).send({
          message: "Failed to get camp details",
        });
      }
    });

    app.get("/registered-camps/:email", async (req, res) => {
      try {
        const { email } = req.params;

        const registeredCamps = await participantCollection
          .find({
            participantEmail: email,
          })
          .toArray();

        res.send(registeredCamps);
      } catch (error) {
        console.error("Registered camps error:", error);

        res.status(500).send({
          message: "Failed to find registered camps",
        });
      }
    });

    // Register participant
    app.post("/participants", async (req, res) => {
      try {
        const participantDetails = req.body;

        console.log("Participant:", participantDetails);

        const result =
          await participantCollection.insertOne(participantDetails);

        res.send(result);
      } catch (error) {
        console.error("Participant registration error:", error);

        res.status(500).send({
          message: "Failed to register participant",
        });
      }
    });

    app.delete(
      "/camp-details/:campId/registration/:email",
      async (req, res) => {
        try {
          const { campId, email } = req.params;

          console.log("Cancel registration:", campId, email);

          if (!ObjectId.isValid(campId)) {
            return res.status(400).send({
              message: "Invalid camp ID",
            });
          }

          // Find participant
          const participant = await participantCollection.findOne({
            campId: campId,
            participantEmail: email,
          });

          if (!participant) {
            return res.status(404).send({
              message: "Registration not found",
            });
          }

          // Delete participant registration
          const deleteResult = await participantCollection.deleteOne({
            _id: participant._id,
          });

          // Decrease participant count
          if (deleteResult.deletedCount > 0) {
            await campdetailCollection.updateOne(
              {
                _id: new ObjectId(campId),
              },
              {
                $inc: {
                  participantCount: -1,
                },
              },
            );
          }

          res.send({
            success: true,
            message: "Registration cancelled successfully",
          });
        } catch (error) {
          console.error("Cancel registration error:", error);

          res.status(500).send({
            message: "Failed to cancel registration",
          });
        }
      },
    );

    await client.db("admin").command({
      ping: 1,
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Keep connection open
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
