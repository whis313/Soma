import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [role, setRole] = useState('customer')

  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState({})
  const [tableNumber, setTableNumber] = useState('')

  const [orders, setOrders] = useState([])
  const [staff, setStaff] = useState([])

  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [selectedWaiter, setSelectedWaiter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedChef, setSelectedChef] = useState('')
  const [selectedBartender, setSelectedBartender] = useState('')

  const [orderNeedsChef, setOrderNeedsChef] = useState(true)
  const [orderNeedsBartender, setOrderNeedsBartender] = useState(true)

  const [feedbackOrderId, setFeedbackOrderId] = useState('')
  const [rating, setRating] = useState('')
  const [complaint, setComplaint] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

  const [paymentOrderId, setPaymentOrderId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDue, setPaymentDue] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentSubmitted, setPaymentSubmitted] = useState(false)
  const [paymentError, setPaymentError] = useState(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)

      const [
        { data: menu, error: menuError },
        { data: staffData, error: staffError }
      ] = await Promise.all([
        supabase
          .from('menu_items')
          .select('*')
          .order('id'),

        supabase
          .from('staff')
          .select('*')
          .order('id')
      ])

      if (menuError) {
        setError(`Could not load menu: ${menuError.message}`)
      } else {
        setMenuItems(menu || [])
      }

      if (staffError) {
        setError(`Could not load staff: ${staffError.message}`)
      } else {
        setStaff(staffData || [])
      }

      setLoading(false)
    }

    loadData()
  }, [])

  async function loadOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(`Could not load orders: ${error.message}`)
    } else {
      setOrders(data || [])
    }
  }

  async function loadPaymentDue(orderId) {
    setPaymentLoading(true)
    setPaymentError(null)
    setPaymentDue(null)

    const numericOrderId = Number(orderId)

    if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setPaymentLoading(false)
      return
    }

    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select('quantity, unit_price, line_total')
      .eq('order_id', numericOrderId)

    if (orderItemsError) {
      setPaymentError(
        `Could not calculate amount due: ${orderItemsError.message}`
      )
      setPaymentLoading(false)
      return
    }

    if (!orderItems || orderItems.length === 0) {
      setPaymentError('No items were found for this order.')
      setPaymentLoading(false)
      return
    }

    const orderTotal = orderItems.reduce((sum, item) => {
      const lineTotal =
        item.line_total !== null &&
        item.line_total !== undefined
          ? Number(item.line_total)
          : Number(item.unit_price) * Number(item.quantity)

      return sum + lineTotal
    }, 0)

    setPaymentDue(orderTotal)
    setPaymentLoading(false)
  }

  function addToCart(item) {
    setCart((currentCart) => ({
      ...currentCart,
      [item.id]: (currentCart[item.id] || 0) + 1
    }))
  }

  function removeFromCart(item) {
    setCart((currentCart) => {
      const newCart = { ...currentCart }

      if (newCart[item.id] > 1) {
        newCart[item.id] -= 1
      } else {
        delete newCart[item.id]
      }

      return newCart
    })
  }

  async function placeOrder() {
    setError(null)
    setSuccess(null)

    if (!tableNumber) {
      setError('Please enter your table number.')
      return
    }

    if (cartItems.length === 0) {
      setError('Please add at least one item to your order.')
      return
    }

    setPlacingOrder(true)

    const waitingTime = Math.max(
      ...cartItems.map((item) => Number(item.preparation_time))
    )

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        table_number: Number(tableNumber),
        waiting_time: waitingTime,
        status: 'Pending'
      })
      .select('*')
      .single()

    if (orderError) {
      setError(`Could not create order: ${orderError.message}`)
      setPlacingOrder(false)
      return
    }

    const orderItems = cartItems.map((item) => ({
      order_id: order.id,
      menu_item_id: item.id,
      quantity: cart[item.id],
      unit_price: Number(item.price),
      line_total: Number(item.price) * cart[item.id]
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      setError(
        `Order created, but items could not be saved: ${itemsError.message}`
      )
      setPlacingOrder(false)
      return
    }

    setSuccess(
      `Order #${order.id} placed successfully! Estimated waiting time: ${waitingTime} minutes.`
    )

    setCart({})
    setTableNumber('')
    setPlacingOrder(false)
  }

  async function openOrder(order) {
    setError(null)
    setSuccess(null)

    if (!selectedWaiter) {
      setError('Please select your name before opening an order.')
      return
    }

    const waiterId = Number(selectedWaiter)

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({
        waiter_id: waiterId
      })
      .eq('id', order.id)
      .select('*')
      .single()

    if (error) {
      setError(`Could not assign waiter: ${error.message}`)
      return
    }

    /*
      Find the items belonging to this order so we can determine
      whether a chef, bartender, or both are actually required.
    */
    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select('menu_item_id')
      .eq('order_id', order.id)

    if (orderItemsError) {
      setError(
        `Order opened, but its items could not be checked: ${orderItemsError.message}`
      )
      return
    }

    let needsChef = false
    let needsBartender = false

    ;(orderItems || []).forEach((orderItem) => {
      const menuItem = menuItems.find(
        (item) => item.id === orderItem.menu_item_id
      )

      if (!menuItem) {
        return
      }

      const category = String(menuItem.category || '').toLowerCase()

      if (category.includes('drink')) {
        needsBartender = true
      } else {
        needsChef = true
      }
    })

    /*
      If the order has items but their categories do not clearly
      identify them, require both roles rather than accidentally
      skipping a required preparer.
    */
    if (
      (orderItems || []).length > 0 &&
      !needsChef &&
      !needsBartender
    ) {
      needsChef = true
      needsBartender = true
    }

    setOrderNeedsChef(needsChef)
    setOrderNeedsBartender(needsBartender)

    setSelectedOrder(updatedOrder)

    setSelectedChef(
      needsChef
        ? updatedOrder.chef_id || ''
        : ''
    )

    setSelectedBartender(
      needsBartender
        ? updatedOrder.bartender_id || ''
        : ''
    )

    setOrders((currentOrders) =>
      currentOrders.map((currentOrder) =>
        currentOrder.id === updatedOrder.id
          ? updatedOrder
          : currentOrder
      )
    )

    const waiter = waiters.find(
      (person) => person.id === waiterId
    )

    setSuccess(
      `Order #${updatedOrder.id} is now assigned to ${waiter?.name || 'the selected waiter'}.`
    )
  }

  async function assignStaff() {
    if (!selectedOrder) return

    setError(null)
    setSuccess(null)

    if (!selectedWaiter) {
      setError('Please select your name.')
      return
    }

    if (orderNeedsChef && !selectedChef) {
      setError('Please select a chef because this order contains food.')
      return
    }

    if (orderNeedsBartender && !selectedBartender) {
      setError(
        'Please select a bartender because this order contains drinks.'
      )
      return
    }

    const updateData = {
      waiter_id: Number(selectedWaiter),
      chef_id: orderNeedsChef
        ? Number(selectedChef)
        : null,
      bartender_id: orderNeedsBartender
        ? Number(selectedBartender)
        : null
    }

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', selectedOrder.id)
      .select('*')
      .single()

    if (error) {
      setError(`Could not assign staff: ${error.message}`)
      return
    }

    setSelectedOrder(updatedOrder)

    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === updatedOrder.id
          ? updatedOrder
          : order
      )
    )

    const waiter = waiters.find(
      (person) => person.id === Number(selectedWaiter)
    )

    setSuccess(
      `Staff assignment saved for Order #${updatedOrder.id}. Waiter: ${waiter?.name || 'Selected waiter'}.`
    )
  }

  async function markServed() {
    if (!selectedOrder) return

    setError(null)
    setSuccess(null)

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({
        status: 'Served',
        waiter_id: selectedWaiter
          ? Number(selectedWaiter)
          : selectedOrder.waiter_id
      })
      .eq('id', selectedOrder.id)
      .select('*')
      .single()

    if (error) {
      setError(
        `Could not mark Order #${selectedOrder.id} as served: ${error.message}`
      )
      return
    }

    if (updatedOrder.status !== 'Served') {
      setError(
        `The database did not confirm Order #${selectedOrder.id} as served.`
      )
      return
    }

    setSelectedOrder(updatedOrder)

    setOrders((currentOrders) =>
      currentOrders.map((order) =>
        order.id === updatedOrder.id
          ? updatedOrder
          : order
      )
    )

    setSuccess(
      `Order #${updatedOrder.id} is now Served.`
    )
  }

  async function submitFeedback() {
    setError(null)
    setSuccess(null)
    setFeedbackSubmitted(false)

    if (!feedbackOrderId) {
      setError('Please enter an order number.')
      return
    }

    if (!rating) {
      setError('Please select a rating.')
      return
    }

    const { error } = await supabase
      .from('feedback')
      .insert({
        order_id: Number(feedbackOrderId),
        rating: Number(rating),
        complaint: complaint || null
      })

    if (error) {
      setError(`Could not submit feedback: ${error.message}`)
      return
    }

    setFeedbackSubmitted(true)
    setSuccess('Thank you! Your feedback has been submitted.')

    setFeedbackOrderId('')
    setRating('')
    setComplaint('')
  }

  async function makePayment() {
    setError(null)
    setSuccess(null)
    setPaymentError(null)
    setPaymentSubmitted(false)

    if (!paymentOrderId) {
      setPaymentError('Please enter an order number.')
      return
    }

    const numericOrderId = Number(paymentOrderId)

    if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setPaymentError('Please enter a valid order number.')
      return
    }

    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setPaymentError('Please enter a valid payment amount.')
      return
    }

    if (paymentDue === null) {
      setPaymentError(
        'The amount due has not been calculated yet.'
      )
      return
    }

    const enteredAmountCents = Math.round(
      Number(paymentAmount) * 100
    )

    const requiredAmountCents = Math.round(
      Number(paymentDue) * 100
    )

    if (enteredAmountCents !== requiredAmountCents) {
      setPaymentError(
        `Payment must be exactly ₦${Number(paymentDue).toLocaleString(
          'en-NG',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }
        )}. No payment was recorded.`
      )
      return
    }

    const {
      data: existingPayment,
      error: existingPaymentError
    } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', numericOrderId)
      .maybeSingle()

    if (existingPaymentError) {
      setPaymentError(
        `Could not check payment status: ${existingPaymentError.message}`
      )
      return
    }

    if (existingPayment) {
      setPaymentError('This order has already been paid.')
      return
    }

    const { error: paymentInsertError } = await supabase
      .from('payments')
      .insert({
        order_id: numericOrderId,
        amount: Number(paymentDue),
        payment_method: 'Pretend Payment',
        status: 'Paid',
        is_pretend: true
      })

    if (paymentInsertError) {
      setPaymentError(
        `Could not process payment: ${paymentInsertError.message}`
      )
      return
    }

    setPaymentSubmitted(true)

    setPaymentOrderId('')
    setPaymentAmount('')
    setPaymentDue(null)
  }

  const cartItems = menuItems.filter(
    (item) => cart[item.id]
  )

  const total = cartItems.reduce(
    (sum, item) =>
      sum + Number(item.price) * cart[item.id],
    0
  )

  const waiters = staff.filter(
    (person) => person.role === 'Waiter'
  )

  const chefs = staff.filter(
    (person) => person.role === 'Chef'
  )

  const bartenders = staff.filter(
    (person) => person.role === 'Bartender'
  )

  return (
    <div className="app">
      <header>
        <h1>Chowly</h1>
        <p>Restaurant Ordering System</p>

        <div className="role-switch">
          <button
            className={
              role === 'customer' ? 'active-role' : ''
            }
            onClick={() => {
              setRole('customer')
              setError(null)
              setSuccess(null)
            }}
          >
            Customer
          </button>

          <button
            className={
              role === 'waiter' ? 'active-role' : ''
            }
            onClick={() => {
              setRole('waiter')
              setError(null)
              setSuccess(null)
              loadOrders()
            }}
          >
            Waiter
          </button>
        </div>
      </header>

      {error && (
        <p className="error">
          {error}
        </p>
      )}

      {success && (
        <p className="success">
          {success}
        </p>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : role === 'customer' ? (
        <>
          <main>
            <section>
              <h2>Menu</h2>

              <div className="menu">
                {menuItems.map((item) => (
                  <div
                    className="menu-card"
                    key={item.id}
                  >
                    <h3>{item.name}</h3>

                    <p className="category">
                      {item.category}
                    </p>

                    <p>
                      ₦{Number(item.price).toLocaleString()}
                    </p>

                    <p>
                      Preparation:{' '}
                      {item.preparation_time} min
                    </p>

                    <button
                      onClick={() =>
                        addToCart(item)
                      }
                    >
                      Add to Order
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <aside className="cart">
              <h2>Your Order</h2>

              <label>Table Number</label>

              <input
                type="number"
                min="1"
                value={tableNumber}
                onChange={(event) =>
                  setTableNumber(
                    event.target.value
                  )
                }
                placeholder="Enter table number"
              />

              {cartItems.length === 0 ? (
                <p>Your order is empty.</p>
              ) : (
                <>
                  {cartItems.map((item) => (
                    <div
                      className="cart-item"
                      key={item.id}
                    >
                      <div>
                        <strong>
                          {item.name}
                        </strong>

                        <p>
                          ₦
                          {Number(
                            item.price
                          ).toLocaleString()}{' '}
                          × {cart[item.id]}
                        </p>
                      </div>

                      <div>
                        <button
                          onClick={() =>
                            removeFromCart(item)
                          }
                        >
                          −
                        </button>

                        <span>
                          {cart[item.id]}
                        </span>

                        <button
                          onClick={() =>
                            addToCart(item)
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}

                  <hr />

                  <h3>
                    Total: ₦
                    {total.toLocaleString()}
                  </h3>

                  <p>
                    Estimated waiting time:{' '}
                    {Math.max(
                      ...cartItems.map(
                        (item) =>
                          Number(item.preparation_time)
                      )
                    )}{' '}
                    minutes
                  </p>

                  <button
                    className="order-button"
                    onClick={placeOrder}
                    disabled={placingOrder}
                  >
                    {placingOrder
                      ? 'Placing Order...'
                      : 'Place Order'}
                  </button>
                </>
              )}
            </aside>
          </main>

          <section className="customer-actions">
            <div className="action-card">
              <h2>Feedback</h2>

              <p>
                Rate your experience or submit a
                complaint.
              </p>

              <label>Order Number</label>

              <input
                type="number"
                value={feedbackOrderId}
                onChange={(event) =>
                  setFeedbackOrderId(
                    event.target.value
                  )
                }
                placeholder="e.g. 2"
              />

              <label>Rating</label>

              <select
                value={rating}
                onChange={(event) =>
                  setRating(event.target.value)
                }
              >
                <option value="">
                  Select rating
                </option>

                <option value="5">
                  5 - Excellent
                </option>

                <option value="4">
                  4 - Good
                </option>

                <option value="3">
                  3 - Average
                </option>

                <option value="2">
                  2 - Poor
                </option>

                <option value="1">
                  1 - Very Poor
                </option>
              </select>

              <label>
                Complaint (optional)
              </label>

              <textarea
                value={complaint}
                onChange={(event) =>
                  setComplaint(
                    event.target.value
                  )
                }
                placeholder="Tell us about your experience"
                rows="4"
              />

              <button
                onClick={submitFeedback}
              >
                Submit Feedback
              </button>

              {feedbackSubmitted && (
                <p className="success">
                  Feedback saved.
                </p>
              )}
            </div>

            <div className="action-card">
              <h2>Payment</h2>

              <p>
                This is a pretend payment for
                demonstration purposes.
              </p>

              <label>Order Number</label>

              <input
                type="number"
                min="1"
                value={paymentOrderId}
                onChange={(event) => {
                  const value = event.target.value

                  setPaymentOrderId(value)
                  setPaymentAmount('')
                  setPaymentDue(null)
                  setPaymentSubmitted(false)
                  setPaymentError(null)

                  if (value) {
                    loadPaymentDue(value)
                  }
                }}
                placeholder="e.g. 2"
              />

              <label>Amount Due</label>

              {paymentLoading ? (
                <p>
                  Calculating order total...
                </p>
              ) : paymentDue !== null ? (
                <h3>
                  ₦
                  {Number(paymentDue).toLocaleString(
                    'en-NG',
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }
                  )}
                </h3>
              ) : (
                <p>
                  Enter an order number to see
                  the amount due.
                </p>
              )}

              <label>Payment Amount</label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(event) => {
                  setPaymentAmount(
                    event.target.value
                  )
                  setPaymentError(null)
                  setPaymentSubmitted(false)
                }}
                placeholder="Enter exact amount"
              />

              <button
                onClick={makePayment}
                disabled={
                  paymentLoading ||
                  paymentDue === null
                }
              >
                Make Pretend Payment
              </button>

              {paymentError && (
                <p className="error">
                  {paymentError}
                </p>
              )}

              {paymentSubmitted && (
                <p className="success">
                  Payment recorded.
                </p>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="waiter-dashboard">
          <h2>Waiter Dashboard</h2>

          <div className="waiter-selection">
            <label>
              Select your name
            </label>

            <select
              value={selectedWaiter}
              onChange={(event) => {
                setSelectedWaiter(event.target.value)
                setSelectedOrder(null)
                setError(null)
                setSuccess(null)
              }}
            >
              <option value="">
                Select waiter
              </option>

              {waiters.map((person) => (
                <option
                  key={person.id}
                  value={person.id}
                >
                  {person.name}
                </option>
              ))}
            </select>
          </div>

          {!selectedWaiter ? (
            <p>
              Please select your name to view and handle orders.
            </p>
          ) : orders.length === 0 ? (
            <p>
              No orders have been placed yet.
            </p>
          ) : (
            <div className="orders">
              {orders.map((order) => (
                <div
                  className="order-card"
                  key={order.id}
                >
                  <h3>
                    Order #{order.id}
                  </h3>

                  <p>
                    <strong>Table:</strong>{' '}
                    {order.table_number}
                  </p>

                  <p>
                    <strong>Status:</strong>{' '}
                    {order.status}
                  </p>

                  <p>
                    <strong>
                      Waiting time:
                    </strong>{' '}
                    {order.waiting_time}{' '}
                    minutes
                  </p>

                  <button
                    onClick={() =>
                      openOrder(order)
                    }
                  >
                    Open Order
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedOrder && (
            <div className="order-details">
              <h2>
                Order #{selectedOrder.id}
              </h2>

              <p>
                Table{' '}
                {selectedOrder.table_number}
              </p>

              <p>
                Status:{' '}
                <strong>
                  {selectedOrder.status}
                </strong>
              </p>

              <p>
                Waiting time:{' '}
                {selectedOrder.waiting_time}{' '}
                minutes
              </p>

              <h3>Assign Staff</h3>

              <label>Waiter</label>

              <input
                type="text"
                value={
                  waiters.find(
                    (person) =>
                      person.id ===
                      Number(selectedWaiter)
                  )?.name || ''
                }
                readOnly
              />

              {orderNeedsChef && (
                <>
                  <label>Chef</label>

                  <select
                    value={selectedChef}
                    onChange={(event) =>
                      setSelectedChef(
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      Select chef
                    </option>

                    {chefs.map((person) => (
                      <option
                        key={person.id}
                        value={person.id}
                      >
                        {person.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {!orderNeedsChef && (
                <p>
                  No chef required — this order contains drinks only.
                </p>
              )}

              {orderNeedsBartender && (
                <>
                  <label>
                    Bartender
                  </label>

                  <select
                    value={selectedBartender}
                    onChange={(event) =>
                      setSelectedBartender(
                        event.target.value
                      )
                    }
                  >
                    <option value="">
                      Select bartender
                    </option>

                    {bartenders.map(
                      (person) => (
                        <option
                          key={person.id}
                          value={person.id}
                        >
                          {person.name}
                        </option>
                      )
                    )}
                  </select>
                </>
              )}

              {!orderNeedsBartender && (
                <p>
                  No bartender required — this order contains food only.
                </p>
              )}

              <button
                onClick={assignStaff}
              >
                Save Staff Assignment
              </button>

              <button
                className="serve-button"
                onClick={markServed}
                disabled={
                  selectedOrder.status ===
                  'Served'
                }
              >
                {selectedOrder.status ===
                'Served'
                  ? 'Order Served'
                  : 'Mark as Served'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default App