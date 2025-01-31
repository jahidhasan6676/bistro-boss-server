const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require('jsonwebtoken');
require('dotenv').config();
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const axios = require('axios');
const qs = require('querystring');
const mg = mailgun.client({ username: 'api', key: process.env.MAIL_GUN_API_KEY || "8e2926b3bb7bfb341781fdd750b77139-d8df908e-e7b7cca0" });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { resolveSoa } = require("dns");
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wwm8j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const menuCollection = client.db("bistroDB").collection("menu");
    const cartsCollection = client.db("bistroDB").collection("carts");
    const usersCollection = client.db("bistroDB").collection("users");
    const paymentsCollection = client.db("bistroDB").collection("payments");
    const sslPaymentsCollection = client.db("bistroDB").collection("sslPayments");


    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    })

    // // middleware
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);

      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" })
        }
        req.decoded = decoded;
        next();
      })
    }

    // use Verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }


    // users related api
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {

      const result = await usersCollection.find().toArray();
      res.send(result)
    })

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === 'admin'
      }
      res.send({ admin })
    })


    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exists
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exist", insertedId: null })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result)
    })

    // patch update admin
    app.patch("/users/admin/:id", verifyToken, verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin"
        }
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)

    })

    // users delete
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result)
    })

    // menu related api
    app.get("/menu", async (req, res) => {
      const user = req.body;
      const result = await menuCollection.find(user).toArray();
      res.send(result)
    })

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result)
    })

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result)
    })

    // menu item update
    app.patch("/menu/:id", async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }
      }
      const result = await menuCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    // delete menu item
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result)
    })

    // update menu item


    // carts collection get
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result)
    })

    app.post("/carts", async (req, res) => {
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result)
    });

    // item delete database and ui
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result)
    })

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      if (!price || isNaN(price)) {
        return res.status(400).send({ error: "Invalid price value" });
      }
      const amount = parseInt(price * 100);

      // Check minimum amount (50 cents or 50 units in smallest currency)
      if (amount < 50) {
        return res.status(400).send({ error: "Amount too small" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ['card']
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    })

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" })
      }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result)
    })


    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);

      // delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      }
      const deleteResult = await cartsCollection.deleteMany(query);

      // send user email about payment confirmation
      mg.messages.create('sandboxe6696673b53747cdb92311e602f6eab8.mailgun.org', {
        from: "Excited User <mailgun@sandboxe6696673b53747cdb92311e602f6eab8.mailgun.org>",
        to: ["jh18186676@gmail.com"],
        subject: "Bistro Boss Order Confirmation",
        text: "Testing some Mailgun awesomeness!",
        html: `<div>
          <h2>Thank you for your order</h2>
          <h4>Your Transaction Id: <strong>${payment?.transactionId}</strong></h4>
          <p>We would like to get your feedback about the food.</p>
        </div>`
      })
        .then(msg => console.log(msg)) // logs response data
        .catch(err => console.log(err)); // logs any error

      res.send({ paymentResult, deleteResult })
    })

    // stats or analytics
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();
      const result = await paymentsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;



      res.send({ users, menuItems, orders, revenue })
    })

    // using aggregate pipeline
    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentsCollection.aggregate([
        {
          $unwind: '$menuItemIds'
        },
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItemIds',
            foreignField: '_id',
            as: 'menuItems'
          }
        },
        {
          $unwind: '$menuItems'
        },
        {
          $group: {
            _id: '$menuItems.category',
            quantity: { $sum: 1 },
            revenue: { $sum: '$menuItems.price' }
          }
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            quantity: '$quantity',
            revenue: '$revenue'
          }
        }
      ]).toArray();
      res.send(result)
    })

    // ssl payment
    app.post("/create-ssl-payment", async (req, res) => {
      const payment = req.body;
      const { menuItemsIds } = req.body;

      const query = { _id: { $in: menuItemsIds} }

      const result = await menuCollection.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalPrice: { $sum: "$price" }
          }
        }
      ]).toArray();
      console.log(result);

      const totalPrice = result.length > 0 ? result[0].totalPrice : 0;
      console.log("price", totalPrice);

      const trxId = new ObjectId().toString();
      payment.transactionId = trxId;

      const initiate = {
        store_id: "bistr679c4ee09efec",
        store_passwd: "bistr679c4ee09efec@ssl",
        total_amount: totalPrice,
        currency: 'BDT',
        tran_id: trxId,
        success_url: 'http://localhost:5000/success-payment',
        fail_url: 'http://localhost:5173/fail',
        cancel_url: 'http://localhost:5173/cancel',
        ipn_url: 'http://localhost:5000/ipn-success-payment',
        shipping_method: 'Courier',
        product_name: 'Computer.',
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: 'Customer Name',
        cus_email: `${payment?.email}`,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: 1000,
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
      };
      const iniResponse = await axios.post(
        "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
        qs.stringify(initiate),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      const saveData = await paymentsCollection.insertOne(payment);
      const gatewayUrl = iniResponse?.data?.GatewayPageURL

      //console.log("gatewayUrl:", gatewayUrl);
      res.send({ gatewayUrl })

    })

    app.post("/success-payment", async (req, res) => {
      const successPayment = req.body;
      // console.log("payment success info", successPayment)

      const { data } = await axios.get(`https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=${successPayment.val_id}&store_id=bistr679c4ee09efec&store_passwd=bistr679c4ee09efec@ssl`)

      // validation
      if (data.status !== 'VALID') {
        return res.send({ message: 'Invalid payment' })
      }

      // update the payment
      const updatePayment = await paymentsCollection.updateOne({ transactionId: data.tran_id }, {
        $set: { status: "Success" }
      })

      const payment = await paymentsCollection.findOne({ transactionId: data.tran_id })
      // console.log("payment", payment)

      // delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      }
      const deleteResult = await cartsCollection.deleteMany(query);
      // console.log(deleteResult)

      res.redirect("http://localhost:5173/success")
      console.log("payment is valid", data)
      console.log("update status", updatePayment)


    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) => {
  res.send("bistro boss server running");
})

app.listen(port, () => {
  console.log(`Bistro boss is sitting on port ${port}`)
})