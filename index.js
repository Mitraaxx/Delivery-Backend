require('dotenv').config();
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const creds = {
  client_email: process.env.CLIENT_EMAIL,
  private_key: process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
};

const app = express();
app.use(express.json());

//Add any tag you want to block (keep it lowercase)
const BLOCKED_TAGS = [
  "cod",
  "high risk",
  "high rto risk",
  "fraud",
  "blacklist",
  "return likely"
];

async function addToSheet(data) {
  try {
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.addRow({
      OrderID: data.id,
      OrderName: data.name,
      OrderDate: data.created_at,
      FirstName: data.first_name,
      LastName: data.last_name,
      Email: data.email,
      Phone: data.phone,
      Products: data.products,
      TotalAmount: data.total_price,
      PaymentMethod: data.gateway,
      Tags: data.tags,
      FullAddress: data.address
    });
    console.log('📝 Saved to Google Sheet successfully!');
  } catch (error) {
    console.error('❌ Sheet Error:', error.message);
  }
}

app.post('/webhook/orders', async (req, res) => {
  try {
    const order = req.body;
    
    const state = order.shipping_address?.province?.toLowerCase() || ""; 
    
    const rawTags = order.tags || "";
    const orderTagsArray = rawTags.split(',').map(tag => tag.trim().toLowerCase());

    const paymentGateways = order.payment_gateway_names || [];
    let gateway = "Prepaid";
    
    if (paymentGateways.includes('manual') || order.gateway === 'manual') {
      gateway = "COD";
    } else if (paymentGateways.length > 0) {
      gateway = paymentGateways.join(", ");
    }

    const hasBlockedTag = orderTagsArray.some(tag => BLOCKED_TAGS.includes(tag));
    const isCOD = gateway === 'COD';
    const isDelhi = state.includes('delhi');

    if (hasBlockedTag) {
      console.log(`⛔ Skipped: Blocked Tag Detected [${rawTags}]`);
      return res.status(200).send('Skipped: Blocked Tag');
    }

    if (isCOD) {
      console.log(`⛔ Skipped: COD Payment`);
      return res.status(200).send('Skipped: COD Payment');
    }

    if (isDelhi) {
      console.log(`✅ Order Matched! Processing...`);
      
      const addr = order.shipping_address || {};
      const finalPhone = order.phone || addr.phone || order.billing_address?.phone || order.customer?.phone || "No Phone";                    
      const fullAddress = `${addr.address1 || ""}, ${addr.city || ""}, ${addr.province || ""}, ${addr.zip || ""}, ${addr.country || ""}`;
      const productNames = order.line_items.map(item => item.title).join(", ");

      await addToSheet({
        id: order.id,
        name: order.name,
        created_at: order.created_at,
        first_name: addr.first_name || order.customer?.first_name || "",
        last_name: addr.last_name || order.customer?.last_name || "",
        email: order.email || order.customer?.email || "",
        phone: finalPhone,
        products: productNames,
        total_price: order.total_price,
        gateway: gateway,
        tags: rawTags,
        address: fullAddress
      });
    } else {
      console.log(`⛔ Skipped: Not from Delhi (State: ${state})`);
    }

    res.status(200).send('Webhook Received');

  } catch (error) {
    console.error('Server Error:', error);
    res.status(200).send('Error handled');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));