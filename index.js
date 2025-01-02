const express = require("express");
const app = express();
const cors = require("cors");
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



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
    await client.connect();

    const menuCollection = client.db("bistroDB").collection("menu");
 


    app.get("/menu", async(req,res) => {
        const user = req.body;
        const result = await menuCollection.find().toArray();
        res.send(result)
    })

    // total data count
    app.get("/count", async(req,res) =>{
      const count = await menuCollection.estimatedDocumentCount();
      res.send({count})
    })
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req,res) =>{
    res.send("bistro boss server running");
})

app.listen(port, ()=>{
    console.log(`Bistro boss is sitting on port ${port}`)
})