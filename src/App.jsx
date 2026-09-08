import {
  useCallback,
  useEffect,
  useState
} from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [role, setRole] = useState('customer')

  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState({})
  const [tableNumber, setTableNumber] = useState('')

  const [orders, setOrders] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [staff, setStaff] = useState([])

  const [loading, setLoading] = useState(true)
  const [placingOrder, setPlacingOrder] = useState(false)

  const [error, setError] = useState(null)

  const [orderMessage, setOrderMessage] = useState(null)
  const [orderError, setOrderError] = useState(null)

  const [feedbackOrderId, setFeedbackOrderId] = useState('')
  const [rating, setRating] = useState('')
  const [complaint, setComplaint] = useState('')
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState(null)
  const [feedbackError, setFeedbackError] = useState(null)

  const [paymentOrderId, setPaymentOrderId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDue, setPaymentDue] = useState(null)
  const [paymentItems, setPaymentItems] = useState([])
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentSubmitted, setPaymentSubmitted] = useState(false)
  const [paymentError, setPaymentError] = useState(null)
  const [paymentMessage, setPaymentMessage] = useState(null)
  const [paymentOrderStatus, setPaymentOrderStatus] = useState('')
  const [tipChoice, setTipChoice] = useState('0')
  const [customTip, setCustomTip] = useState('')

  const [selectedWaiter, setSelectedWaiter] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedChef, setSelectedChef] = useState('')
  const [selectedBartender, setSelectedBartender] = useState('')

  const [orderNeedsChef, setOrderNeedsChef] = useState(true)
  const [orderNeedsBartender, setOrderNeedsBartender] = useState(true)

  const [staffMessage, setStaffMessage] = useState(null)
  const [staffError, setStaffError] = useState(null)

  const [servedMessage, setServedMessage] = useState(null)
  const [servedError, setServedError] = useState(null)

  const [lastPlacedOrder, setLastPlacedOrder] = useState(null)

  const [currentTime, setCurrentTime] = useState(new Date())

  const [customerId] = useState(() => {
    const existingCustomerId = localStorage.getItem(
      'chowly_customer_id'
    )

    if (existingCustomerId) {
      return existingCustomerId
    }

    const generatedCustomerId = `CUS-${Math.floor(
      100000 + Math.random() * 900000
    )}`

    localStorage.setItem(
      'chowly_customer_id',
      generatedCustomerId
    )

    return generatedCustomerId
  })

  function formatCurrency(amount) {
    return `₦${Number(amount || 0).toLocaleString(
      'en-NG',
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )}`
  }

  function formatWholeCurrency(amount) {
    return `₦${Number(amount || 0).toLocaleString(
      'en-NG'
    )}`
  }

  function formatMoneyInput(value) {
    if (value === '') {
      return ''
    }

    let cleaned = String(value).replace(
      /[^\d.]/g,
      ''
    )

    const firstDecimalPoint =
      cleaned.indexOf('.')

    if (firstDecimalPoint !== -1) {
      const wholePart = cleaned.slice(
        0,
        firstDecimalPoint
      )

      const decimalPart = cleaned
        .slice(firstDecimalPoint + 1)
        .replace(/\./g, '')
        .slice(0, 2)

      cleaned = `${wholePart}.${decimalPart}`
    }

    const [whole = '', decimal] =
      cleaned.split('.')

    const formattedWhole = whole
      ? Number(whole).toLocaleString('en-NG')
      : '0'

    return decimal !== undefined
      ? `${formattedWhole}.${decimal}`
      : formattedWhole
  }

  function parseMoney(value) {
    const parsed = Number(
      String(value || '').replace(/,/g, '')
    )

    return Number.isFinite(parsed)
      ? parsed
      : 0
  }

  function formatOrderNumber(orderId) {
    return `CHW-${String(orderId).padStart(
      4,
      '0'
    )}`
  }

  function parseOrderId(value) {
    const numericValue = String(value || '')
      .replace(/[^0-9]/g, '')

    const parsed = Number(numericValue)

    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : null
  }

  function formatStaffId(staffId) {
    return `STF-${String(staffId).padStart(
      4,
      '0'
    )}`
  }

  function formatDateTime(value) {
    if (!value) {
      return 'Not recorded'
    }

    return new Date(value).toLocaleString(
      'en-NG',
      {
        dateStyle: 'medium',
        timeStyle: 'short'
      }
    )
  }

  function getDelayMinutes(order) {
    if (
      !order?.expected_ready_at ||
      order.status === 'Paid'
    ) {
      return 0
    }

    const expectedTime = new Date(
      order.expected_ready_at
    ).getTime()

    const comparisonTime =
      order.served_at
        ? new Date(order.served_at).getTime()
        : currentTime.getTime()

    if (
      !Number.isFinite(expectedTime) ||
      comparisonTime <= expectedTime
    ) {
      return 0
    }

    return Math.max(
      1,
      Math.floor(
        (comparisonTime - expectedTime) / 60000
      )
    )
  }

  function isOrderOverdue(order) {
    return (
      order?.status === 'Pending' &&
      getDelayMinutes(order) > 0
    )
  }

  async function syncOverdueOrders(loadedOrders) {
    const now = Date.now()

    const overdueOrders = loadedOrders.filter(
      (order) => {
        if (
          order.status !== 'Pending' ||
          !order.expected_ready_at
        ) {
          return false
        }

        const expectedTime = new Date(
          order.expected_ready_at
        ).getTime()

        return (
          Number.isFinite(expectedTime) &&
          now > expectedTime
        )
      }
    )

    if (overdueOrders.length === 0) {
      return loadedOrders
    }

    const updatedResults = await Promise.all(
      overdueOrders.map(async (order) => {
        const expectedTime = new Date(
          order.expected_ready_at
        ).getTime()

        const delayMinutes = Math.max(
          1,
          Math.floor(
            (now - expectedTime) / 60000
          )
        )

        const { data, error } =
          await supabase
            .from('orders')
            .update({
              delay_minutes: delayMinutes,
              was_delayed: true
            })
            .eq('id', order.id)
            .select('*')
            .single()

        if (error) {
          return order
        }

        return data
      })
    )

    return loadedOrders.map(
      (order) =>
        updatedResults.find(
          (updatedOrder) =>
            updatedOrder.id === order.id
        ) || order
    )
  }

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', {
        ascending: false
      })

    if (error) {
      setError(
        `Could not load orders: ${error.message}`
      )
      return
    }

    const updatedOrders =
      await syncOverdueOrders(data || [])

    setOrders(updatedOrders)

    if (
      selectedOrder &&
      updatedOrders.some(
        (order) =>
          order.id === selectedOrder.id
      )
    ) {
      setSelectedOrder(
        updatedOrders.find(
          (order) =>
            order.id === selectedOrder.id
        )
      )
    }
  }, [selectedOrder])

  const loadCustomerOrders = useCallback(
    async () => {
      const { data, error } =
        await supabase
          .from('orders')
          .select('*')
          .eq(
            'customer_code',
            customerId
          )
          .order('created_at', {
            ascending: false
          })

      if (error) {
        setError(
          `Could not load your orders: ${error.message}`
        )
        return
      }

      setCustomerOrders(data || [])
    },
    [customerId]
  )

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
        setError(
          `Could not load menu: ${menuError.message}`
        )
      } else {
        setMenuItems(menu || [])
      }

      if (staffError) {
        setError(
          `Could not load staff: ${staffError.message}`
        )
      } else {
        setStaff(staffData || [])
      }

      setLoading(false)
    }

    loadData()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 15000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (role !== 'waiter') {
      return undefined
    }

    const timer = setInterval(() => {
      loadOrders()
    }, 30000)

    return () => clearInterval(timer)
  }, [role, loadOrders])

  async function switchToCustomer() {
    setRole('customer')
    setError(null)
    setOrderMessage(null)
    setStaffMessage(null)
    setServedMessage(null)
    setFeedbackError(null)
    setPaymentError(null)

    await loadCustomerOrders()
  }

  async function switchToWaiter() {
    setRole('waiter')
    setError(null)
    setOrderMessage(null)
    setStaffMessage(null)
    setServedMessage(null)

    await loadOrders()
  }

  async function loadPaymentDue(orderIdentifier) {
    setPaymentLoading(true)
    setPaymentError(null)
    setPaymentMessage(null)
    setPaymentDue(null)
    setPaymentItems([])
    setPaymentOrderStatus('')

    const numericOrderId =
      parseOrderId(orderIdentifier)

    if (!numericOrderId) {
      setPaymentLoading(false)
      return
    }

    const customerOwnsOrder =
      customerOrders.some(
        (order) =>
          order.id === numericOrderId
      )

    if (!customerOwnsOrder) {
      setPaymentError(
        'That order does not belong to your Customer ID.'
      )
      setPaymentLoading(false)
      return
    }

    const [
      {
        data: order,
        error: orderError
      },
      {
        data: orderItems,
        error: orderItemsError
      }
    ] = await Promise.all([
      supabase
        .from('orders')
        .select(
          'id, status, table_number, customer_code'
        )
        .eq('id', numericOrderId)
        .eq(
          'customer_code',
          customerId
        )
        .maybeSingle(),

      supabase
        .from('order_items')
        .select(
          'id, menu_item_id, quantity, unit_price, line_total'
        )
        .eq(
          'order_id',
          numericOrderId
        )
        .order('id')
    ])

    if (orderError) {
      setPaymentError(
        `Could not load order: ${orderError.message}`
      )
      setPaymentLoading(false)
      return
    }

    if (!order) {
      setPaymentError(
        'No matching order was found for your Customer ID.'
      )
      setPaymentLoading(false)
      return
    }

    if (orderItemsError) {
      setPaymentError(
        `Could not calculate amount due: ${orderItemsError.message}`
      )
      setPaymentLoading(false)
      return
    }

    if (
      !orderItems ||
      orderItems.length === 0
    ) {
      setPaymentError(
        'No items were found for this order.'
      )
      setPaymentLoading(false)
      return
    }

    const breakdown = orderItems.map(
      (item) => {
        const menuItem =
          menuItems.find(
            (record) =>
              record.id === item.menu_item_id
          )

        const quantity =
          Number(item.quantity) || 0

        const unitPrice =
          Number(item.unit_price) || 0

        const lineTotal =
          item.line_total !== null &&
          item.line_total !== undefined
            ? Number(item.line_total)
            : unitPrice * quantity

        return {
          id: item.id,
          name:
            menuItem?.name ||
            `Menu item #${item.menu_item_id}`,
          quantity,
          unitPrice,
          lineTotal
        }
      }
    )

    const orderTotal =
      breakdown.reduce(
        (sum, item) =>
          sum + item.lineTotal,
        0
      )

    setPaymentItems(breakdown)
    setPaymentDue(orderTotal)
    setPaymentOrderStatus(
      order.status || ''
    )

    setPaymentAmount(
      formatMoneyInput(orderTotal)
    )

    setTipChoice('0')
    setCustomTip('')

    setPaymentLoading(false)
  }

  function getTipAmount() {
    const subtotal =
      Number(paymentDue || 0)

    if (tipChoice === 'custom') {
      return parseMoney(customTip)
    }

    return (
      subtotal *
      (Number(tipChoice) / 100)
    )
  }

  const tipAmount = getTipAmount()

  const paymentTotal =
    Number(paymentDue || 0) +
    tipAmount

  function addToCart(item) {
    setCart((currentCart) => ({
      ...currentCart,
      [item.id]:
        (currentCart[item.id] || 0) + 1
    }))
  }

  function removeFromCart(item) {
    setCart((currentCart) => {
      const newCart = {
        ...currentCart
      }

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
    setOrderMessage(null)
    setOrderError(null)

    if (!tableNumber) {
      setOrderError(
        'Please enter your table number.'
      )
      return
    }

    if (cartItems.length === 0) {
      setOrderError(
        'Please add at least one item to your order.'
      )
      return
    }

    setPlacingOrder(true)

    const waitingTime = Math.max(
      ...cartItems.map((item) =>
        Number(item.preparation_time)
      )
    )

    const createdAt = new Date()

    const expectedReadyAt = new Date(
      createdAt.getTime() +
        waitingTime * 60 * 1000
    )

    const {
      data: order,
      error: orderError
    } = await supabase
      .from('orders')
      .insert({
        table_number: Number(tableNumber),
        waiting_time: waitingTime,
        status: 'Pending',
        customer_code: customerId,
        expected_ready_at:
          expectedReadyAt.toISOString(),
        delay_minutes: 0,
        was_delayed: false
      })
      .select('*')
      .single()

    if (orderError) {
      setOrderError(
        `Could not create order: ${orderError.message}`
      )
      setPlacingOrder(false)
      return
    }

    const orderItems =
      cartItems.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: cart[item.id],
        unit_price: Number(item.price),
        line_total:
          Number(item.price) *
          cart[item.id]
      }))

    const { error: itemsError } =
      await supabase
        .from('order_items')
        .insert(orderItems)

    if (itemsError) {
      setOrderError(
        `Order was created, but items could not be saved: ${itemsError.message}`
      )
      setPlacingOrder(false)
      return
    }

    const placedOrderDetails = {
      ...order,
      items: cartItems.map(
        (item) => ({
          id: item.id,
          name: item.name,
          quantity: cart[item.id],
          unitPrice: Number(item.price),
          lineTotal:
            Number(item.price) *
            cart[item.id]
        })
      ),
      total: orderItems.reduce(
        (sum, item) =>
          sum + item.line_total,
        0
      )
    }

    setLastPlacedOrder(
      placedOrderDetails
    )

    setOrderMessage(
      `Order ${formatOrderNumber(
        order.id
      )} placed successfully.`
    )

    setCart({})
    setTableNumber('')
    setPlacingOrder(false)

    await Promise.all([
      loadOrders(),
      loadCustomerOrders()
    ])
  }

  async function openOrder(order) {
    setError(null)
    setStaffMessage(null)
    setStaffError(null)
    setServedMessage(null)
    setServedError(null)

    if (!selectedWaiter) {
      setStaffError(
        'Please select your name before opening an order.'
      )
      return
    }

    const waiterId =
      Number(selectedWaiter)

    const {
      data: updatedOrder,
      error: updateError
    } = await supabase
      .from('orders')
      .update({
        waiter_id: waiterId
      })
      .eq('id', order.id)
      .select('*')
      .single()

    if (updateError) {
      setStaffError(
        `Could not assign waiter: ${updateError.message}`
      )
      return
    }

    const {
      data: orderItems,
      error: orderItemsError
    } = await supabase
      .from('order_items')
      .select('menu_item_id')
      .eq('order_id', order.id)

    if (orderItemsError) {
      setStaffError(
        `Order opened, but its items could not be checked: ${orderItemsError.message}`
      )
      return
    }

    let needsChef = false
    let needsBartender = false

    ;(orderItems || []).forEach(
      (orderItem) => {
        const menuItem =
          menuItems.find(
            (item) =>
              item.id ===
              orderItem.menu_item_id
          )

        if (!menuItem) {
          return
        }

        const category =
          String(
            menuItem.category || ''
          ).toLowerCase()

        if (
          category.includes('drink')
        ) {
          needsBartender = true
        } else {
          needsChef = true
        }
      }
    )

    if (
      (orderItems || []).length > 0 &&
      !needsChef &&
      !needsBartender
    ) {
      needsChef = true
      needsBartender = true
    }

    setOrderNeedsChef(
      needsChef
    )

    setOrderNeedsBartender(
      needsBartender
    )

    setSelectedOrder(
      updatedOrder
    )

    setSelectedChef(
      needsChef
        ? updatedOrder.chef_id || ''
        : ''
    )

    setSelectedBartender(
      needsBartender
        ? updatedOrder.bartender_id ||
          ''
        : ''
    )

    setOrders(
      (currentOrders) =>
        currentOrders.map(
          (currentOrder) =>
            currentOrder.id ===
            updatedOrder.id
              ? updatedOrder
              : currentOrder
        )
    )

    const waiter = waiters.find(
      (person) =>
        person.id === waiterId
    )

    setStaffMessage(
      `Order ${formatOrderNumber(
        updatedOrder.id
      )} opened by ${
        waiter?.name ||
        'the selected waiter'
      }.`
    )
  }

  async function assignStaff() {
    if (!selectedOrder) {
      return
    }

    setStaffMessage(null)
    setStaffError(null)

    if (!selectedWaiter) {
      setStaffError(
        'Please select your name.'
      )
      return
    }

    if (
      orderNeedsChef &&
      !selectedChef
    ) {
      setStaffError(
        'Please select a chef because this order contains food.'
      )
      return
    }

    if (
      orderNeedsBartender &&
      !selectedBartender
    ) {
      setStaffError(
        'Please select a bartender because this order contains drinks.'
      )
      return
    }

    const updateData = {
      waiter_id:
        Number(selectedWaiter),

      chef_id: orderNeedsChef
        ? Number(selectedChef)
        : null,

      bartender_id:
        orderNeedsBartender
          ? Number(
              selectedBartender
            )
          : null
    }

    const {
      data: updatedOrder,
      error
    } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', selectedOrder.id)
      .select('*')
      .single()

    if (error) {
      setStaffError(
        `Could not assign staff: ${error.message}`
      )
      return
    }

    setSelectedOrder(
      updatedOrder
    )

    setOrders(
      (currentOrders) =>
        currentOrders.map(
          (currentOrder) =>
            currentOrder.id ===
            updatedOrder.id
              ? updatedOrder
              : currentOrder
        )
    )

    const waiter = waiters.find(
      (person) =>
        person.id ===
        Number(selectedWaiter)
    )

    const chef = chefs.find(
      (person) =>
        person.id ===
        Number(selectedChef)
    )

    const bartender =
      bartenders.find(
        (person) =>
          person.id ===
          Number(selectedBartender)
      )

    const assignments = [
      waiter
        ? `Waiter: ${waiter.name}`
        : null,

      chef && orderNeedsChef
        ? `Chef: ${chef.name}`
        : null,

      bartender &&
      orderNeedsBartender
        ? `Bartender: ${bartender.name}`
        : null
    ].filter(Boolean)

    setStaffMessage(
      `Staff assignment saved for ${formatOrderNumber(
        updatedOrder.id
      )}. ${assignments.join(
        ' • '
      )}`
    )
  }

  async function markServed() {
    if (!selectedOrder) {
      return
    }

    setServedMessage(null)
    setServedError(null)

    const servedAt =
      new Date().toISOString()

    let delayMinutes = 0

    if (
      selectedOrder.expected_ready_at
    ) {
      const expectedTime =
        new Date(
          selectedOrder.expected_ready_at
        ).getTime()

      const actualTime =
        new Date(
          servedAt
        ).getTime()

      if (
        actualTime >
        expectedTime
      ) {
        delayMinutes =
          Math.max(
            1,
            Math.floor(
              (actualTime -
                expectedTime) /
                60000
            )
          )
      }
    }

    const {
      data: updatedOrder,
      error
    } = await supabase
      .from('orders')
      .update({
        status: 'Served',

        waiter_id:
          selectedWaiter
            ? Number(
                selectedWaiter
              )
            : selectedOrder.waiter_id,

        served_at: servedAt,

        delay_minutes:
          delayMinutes,

        was_delayed:
          delayMinutes > 0
      })
      .eq('id', selectedOrder.id)
      .select('*')
      .single()

    if (error) {
      setServedError(
        `Could not mark ${formatOrderNumber(
          selectedOrder.id
        )} as served: ${error.message}`
      )
      return
    }

    setSelectedOrder(
      updatedOrder
    )

    setOrders(
      (currentOrders) =>
        currentOrders.map(
          (order) =>
            order.id ===
            updatedOrder.id
              ? updatedOrder
              : order
        )
    )

    await loadCustomerOrders()

    if (delayMinutes > 0) {
      setServedMessage(
        `${formatOrderNumber(
          updatedOrder.id
        )} marked as Served. It was ${delayMinutes} minute${
          delayMinutes === 1
            ? ''
            : 's'
        } late, and the delay has been recorded.`
      )
    } else {
      setServedMessage(
        `${formatOrderNumber(
          updatedOrder.id
        )} marked as Served on time.`
      )
    }
  }

  async function submitFeedback() {
    setFeedbackMessage(null)
    setFeedbackError(null)
    setFeedbackSubmitted(false)

    const numericOrderId =
      parseOrderId(feedbackOrderId)

    if (!numericOrderId) {
      setFeedbackError(
        'Please select an order.'
      )
      return
    }

    const customerOwnsOrder =
      customerOrders.some(
        (order) =>
          order.id === numericOrderId
      )

    if (!customerOwnsOrder) {
      setFeedbackError(
        'Please select one of your orders.'
      )
      return
    }

    if (!rating) {
      setFeedbackError(
        'Please select a rating.'
      )
      return
    }

    const { error } =
      await supabase
        .from('feedback')
        .insert({
          order_id:
            numericOrderId,
          rating:
            Number(rating),
          complaint:
            complaint || null
        })

    if (error) {
      setFeedbackError(
        `Could not submit feedback: ${error.message}`
      )
      return
    }

    setFeedbackSubmitted(true)

    setFeedbackMessage(
      `Feedback saved for ${formatOrderNumber(
        numericOrderId
      )}.`
    )

    setFeedbackOrderId('')
    setRating('')
    setComplaint('')
  }

  async function makePayment() {
    setPaymentError(null)
    setPaymentMessage(null)
    setPaymentSubmitted(false)

    const numericOrderId =
      parseOrderId(paymentOrderId)

    if (!numericOrderId) {
      setPaymentError(
        'Please select an order.'
      )
      return
    }

    if (!customerOrders.some(
      (order) =>
        order.id === numericOrderId
    )) {
      setPaymentError(
        'Please select one of your orders.'
      )
      return
    }

    const enteredAmount =
      parseMoney(paymentAmount)

    if (
      !paymentAmount ||
      enteredAmount <= 0
    ) {
      setPaymentError(
        'Please enter a valid payment amount.'
      )
      return
    }

    if (paymentDue === null) {
      setPaymentError(
        'The amount due has not been calculated yet.'
      )
      return
    }

    const enteredAmountCents =
      Math.round(
        enteredAmount * 100
      )

    const requiredAmountCents =
      Math.round(
        paymentTotal * 100
      )

    if (
      enteredAmountCents !==
      requiredAmountCents
    ) {
      setPaymentError(
        `Payment must be exactly ${formatCurrency(
          paymentTotal
        )}.`
      )
      return
    }

    const {
      data: existingPayment,
      error: existingPaymentError
    } = await supabase
      .from('payments')
      .select('id')
      .eq(
        'order_id',
        numericOrderId
      )
      .maybeSingle()

    if (existingPaymentError) {
      setPaymentError(
        `Could not check payment status: ${existingPaymentError.message}`
      )
      return
    }

    if (existingPayment) {
      setPaymentError(
        'This order has already been paid.'
      )
      return
    }

    const {
      data: payment,
      error: paymentInsertError
    } = await supabase
      .from('payments')
      .insert({
        order_id:
          numericOrderId,

        amount:
          Number(paymentTotal),

        tip_amount:
          Number(tipAmount),

        payment_method:
          'Pretend Payment',

        status: 'Paid',

        is_pretend: true
      })
      .select('*')
      .single()

    if (paymentInsertError) {
      setPaymentError(
        `Could not process payment: ${paymentInsertError.message}`
      )
      return
    }

    const {
      data: updatedOrder,
      error: orderUpdateError
    } = await supabase
      .from('orders')
      .update({
        status: 'Paid'
      })
      .eq('id', numericOrderId)
      .eq(
        'customer_code',
        customerId
      )
      .select('*')
      .single()

    if (orderUpdateError) {
      await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id)

      setPaymentError(
        `Payment could not be completed because the order could not be marked as paid: ${orderUpdateError.message}`
      )
      return
    }

    setPaymentSubmitted(true)

    setPaymentMessage(
      `Payment recorded. ${formatOrderNumber(
        numericOrderId
      )} is now Paid.`
    )

    setCustomerOrders(
      (currentOrders) =>
        currentOrders.map(
          (order) =>
            order.id ===
            updatedOrder.id
              ? updatedOrder
              : order
        )
    )

    setPaymentOrderId('')
    setPaymentAmount('')
    setPaymentDue(null)
    setPaymentItems([])
    setPaymentOrderStatus('')
    setTipChoice('0')
    setCustomTip('')
  }

  const cartItems = menuItems.filter(
  (item) => cart[item.id]
)

const total = cartItems.reduce(
  (sum, item) =>
    sum +
    Number(item.price) *
      cart[item.id],
  0
)

  const waiters = staff.filter(
    (person) =>
      person.role === 'Waiter'
  )

  const chefs = staff.filter(
    (person) =>
      person.role === 'Chef'
  )

  const bartenders = staff.filter(
    (person) =>
      person.role === 'Bartender'
  )

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="brand-row">
            <div className="brand-mark">
              C
            </div>

            <div>
              <h1>Chowly</h1>

              <p>
                Restaurant Ordering System
              </p>
            </div>
          </div>

          {role === 'customer' && (
            <div className="identity-badge">
              <span>
                Customer ID
              </span>

              <strong>
                {customerId}
              </strong>
            </div>
          )}
        </div>

        <div className="role-switch">
          <button
            className={
              role === 'customer'
                ? 'active-role'
                : ''
            }
            onClick={
              switchToCustomer
            }
          >
            Customer
          </button>

          <button
            className={
              role === 'waiter'
                ? 'active-role'
                : ''
            }
            onClick={
              switchToWaiter
            }
          >
            Waiter
          </button>
        </div>
      </header>

      {error && (
        <div className="global-alert error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="loading-spinner" />

          <p>
            Loading Chowly...
          </p>
        </div>
      ) : role === 'customer' ? (
        <>
          <section className="hero-card">
            <div>
              <span className="eyebrow">
                Welcome to Chowly
              </span>

              <h2>
                Order from your table
              </h2>

              <p>
                Browse the menu, track your
                order, leave feedback and
                complete your pretend payment
                before you leave.
              </p>
            </div>

            <div className="hero-stat">
              <span>
                Your customer ID
              </span>

              <strong>
                {customerId}
              </strong>
            </div>
          </section>

          <main className="customer-layout">
            <section className="menu-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    Explore
                  </span>

                  <h2>
                    Menu
                  </h2>
                </div>

                <span className="item-count">
                  {menuItems.length} items
                </span>
              </div>

              <div className="menu">
                {menuItems.map(
                  (item) => (
                    <div
                      className="menu-card"
                      key={item.id}
                    >
                      <div className="menu-card-top">
                        <span className="category-pill">
                          {item.category}
                        </span>

                        <span className="prep-pill">
                          {
                            item.preparation_time
                          }{' '}
                          min
                        </span>
                      </div>

                      <h3>
                        {item.name}
                      </h3>

                      <div className="menu-card-footer">
                        <strong>
                          {formatWholeCurrency(
                            item.price
                          )}
                        </strong>

                        <button
                          onClick={() =>
                            addToCart(
                              item
                            )
                          }
                        >
                          Add to Order
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </section>

            <aside className="cart">
              <div className="card-title-row">
                <div>
                  <span className="eyebrow">
                    Current selection
                  </span>

                  <h2>
                    Your Order
                  </h2>
                </div>

                <span className="cart-count">
                  {cartItems.reduce(
                    (sum, item) =>
                      sum +
                      cart[item.id],
                    0
                  )}
                </span>
              </div>

              <label>
                Table Number
              </label>

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

              {cartItems.length ===
              0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    +
                  </div>

                  <h3>
                    Your order is empty
                  </h3>

                  <p>
                    Add items from the
                    menu to start your
                    order.
                  </p>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {cartItems.map(
                      (item) => (
                        <div
                          className="cart-item"
                          key={item.id}
                        >
                          <div className="cart-item-info">
                            <strong>
                              {item.name}
                            </strong>

                            <span>
                              {formatCurrency(
                                item.price
                              )}{' '}
                              ×{' '}
                              {
                                cart[
                                  item.id
                                ]
                              }
                            </span>
                          </div>

                          <div className="quantity-control">
                            <button
                              onClick={() =>
                                removeFromCart(
                                  item
                                )
                              }
                            >
                              −
                            </button>

                            <span>
                              {
                                cart[
                                  item.id
                                ]
                              }
                            </span>

                            <button
                              onClick={() =>
                                addToCart(
                                  item
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  <div className="summary-row total-row">
                    <span>
                      Total
                    </span>

                    <strong>
                      {formatCurrency(
                        total
                      )}
                    </strong>
                  </div>

                  <div className="waiting-estimate">
                    <span>
                      Estimated waiting time
                    </span>

                    <strong>
                      {Math.max(
                        ...cartItems.map(
                          (item) =>
                            Number(
                              item.preparation_time
                            )
                        )
                      )}{' '}
                      min
                    </strong>
                  </div>

                  <button
                    className="primary-button order-button"
                    onClick={
                      placeOrder
                    }
                    disabled={
                      placingOrder
                    }
                  >
                    {placingOrder
                      ? 'Placing Order...'
                      : 'Place Order'}
                  </button>

                  {orderError && (
                    <div className="inline-feedback error">
                      {orderError}
                    </div>
                  )}

                  {orderMessage && (
                    <div className="inline-feedback success">
                      {orderMessage}
                    </div>
                  )}
                </>
              )}
            </aside>
          </main>

          {lastPlacedOrder && (
            <section className="order-confirmation">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    Order confirmed
                  </span>

                  <h2>
                    {formatOrderNumber(
                      lastPlacedOrder.id
                    )}
                  </h2>
                </div>

                <span
                  className={`status-badge status-${String(
                    lastPlacedOrder.status
                  ).toLowerCase()}`}
                >
                  {
                    lastPlacedOrder.status
                  }
                </span>
              </div>

              <div className="confirmation-grid">
                <div>
                  <span>
                    Customer ID
                  </span>

                  <strong>
                    {
                      lastPlacedOrder.customer_code ||
                      customerId
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Table
                  </span>

                  <strong>
                    {
                      lastPlacedOrder.table_number
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Estimated ready
                  </span>

                  <strong>
                    {formatDateTime(
                      lastPlacedOrder.expected_ready_at
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Waiting time
                  </span>

                  <strong>
                    {
                      lastPlacedOrder.waiting_time
                    }{' '}
                    min
                  </strong>
                </div>
              </div>

              <div className="confirmation-items">
                <div className="confirmation-items-heading">
                  <span>
                    Item
                  </span>

                  <span>
                    Amount
                  </span>
                </div>

                {lastPlacedOrder.items.map(
                  (item) => (
                    <div
                      className="confirmation-item"
                      key={item.id}
                    >
                      <div>
                        <strong>
                          {item.name}
                        </strong>

                        <span>
                          {
                            item.quantity
                          }{' '}
                          ×{' '}
                          {formatCurrency(
                            item.unitPrice
                          )}
                        </span>
                      </div>

                      <strong>
                        {formatCurrency(
                          item.lineTotal
                        )}
                      </strong>
                    </div>
                  )
                )}

                <div className="summary-row total-row">
                  <span>
                    Total
                  </span>

                  <strong>
                    {formatCurrency(
                      lastPlacedOrder.total
                    )}
                  </strong>
                </div>
              </div>
            </section>
          )}

          <section className="customer-actions">
            <div className="action-card">
              <div className="action-card-header">
                <div className="action-icon">
                  ★
                </div>

                <div>
                  <span className="eyebrow">
                    Customer experience
                  </span>

                  <h2>
                    Feedback
                  </h2>
                </div>
              </div>

              <p className="action-description">
                Rate your experience or report
                a problem with one of your
                orders.
              </p>

              <label>
                Select Order
              </label>

              <select
                value={
                  feedbackOrderId
                }
                onChange={(event) =>
                  setFeedbackOrderId(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Select one of your orders
                </option>

                {customerOrders.map(
                  (order) => (
                    <option
                      key={order.id}
                      value={order.id}
                    >
                      {formatOrderNumber(
                        order.id
                      )}{' '}
                      • Table{' '}
                      {
                        order.table_number
                      }{' '}
                      •{' '}
                      {order.status}
                    </option>
                  )
                )}
              </select>

              {customerOrders.length ===
                0 && (
                <p className="field-help">
                  No orders are currently
                  linked to your Customer ID.
                </p>
              )}

              <label>
                Rating
              </label>

              <select
                value={rating}
                onChange={(event) =>
                  setRating(
                    event.target.value
                  )
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
                className="secondary-button"
                onClick={
                  submitFeedback
                }
                disabled={
                  customerOrders.length ===
                  0
                }
              >
                Submit Feedback
              </button>

              {feedbackError && (
                <div className="inline-feedback error">
                  {
                    feedbackError
                  }
                </div>
              )}

              {feedbackSubmitted &&
                feedbackMessage && (
                  <div className="inline-feedback success">
                    {
                      feedbackMessage
                    }
                  </div>
                )}
            </div>

            <div className="action-card">
              <div className="action-card-header">
                <div className="action-icon">
                  ₦
                </div>

                <div>
                  <span className="eyebrow">
                    Checkout
                  </span>

                  <h2>
                    Payment
                  </h2>
                </div>
              </div>

              <div className="pretend-payment-notice">
                <strong>
                  Pretend Payment
                </strong>

                <span>
                  This payment is for
                  demonstration only. No
                  real money is charged.
                </span>
              </div>

              <label>
                Select Order
              </label>

              <select
                value={
                  paymentOrderId
                }
                onChange={(event) => {
                  const value =
                    event.target.value

                  setPaymentOrderId(
                    value
                  )

                  setPaymentAmount(
                    ''
                  )

                  setPaymentDue(
                    null
                  )

                  setPaymentItems(
                    []
                  )

                  setPaymentOrderStatus(
                    ''
                  )

                  setPaymentSubmitted(
                    false
                  )

                  setPaymentError(
                    null
                  )

                  setPaymentMessage(
                    null
                  )

                  setTipChoice(
                    '0'
                  )

                  setCustomTip(
                    ''
                  )

                  if (
                    value
                  ) {
                    loadPaymentDue(
                      value
                    )
                  }
                }}
              >
                <option value="">
                  Select one of your orders
                </option>

                {customerOrders.map(
                  (order) => (
                    <option
                      key={order.id}
                      value={order.id}
                    >
                      {formatOrderNumber(
                        order.id
                      )}{' '}
                      • Table{' '}
                      {
                        order.table_number
                      }{' '}
                      •{' '}
                      {order.status}
                    </option>
                  )
                )}
              </select>

              {paymentLoading ? (
                <div className="payment-loading">
                  Loading order...
                </div>
              ) : paymentItems.length >
                0 ? (
                <>
                  <div className="payment-order-meta">
                    <span>
                      Order status
                    </span>

                    <span
                      className={`status-badge status-${paymentOrderStatus.toLowerCase()}`}
                    >
                      {
                        paymentOrderStatus
                      }
                    </span>
                  </div>

                  <div className="payment-breakdown">
                    <div className="payment-breakdown-heading">
                      <span>
                        Order items
                      </span>

                      <span>
                        Amount
                      </span>
                    </div>

                    {paymentItems.map(
                      (item) => (
                        <div
                          className="payment-line"
                          key={item.id}
                        >
                          <div>
                            <strong>
                              {item.name}
                            </strong>

                            <span>
                              {
                                item.quantity
                              }{' '}
                              ×{' '}
                              {formatCurrency(
                                item.unitPrice
                              )}
                            </span>
                          </div>

                          <strong>
                            {formatCurrency(
                              item.lineTotal
                            )}
                          </strong>
                        </div>
                      )
                    )}

                    <div className="payment-total-group">
                      <div className="summary-row">
                        <span>
                          Subtotal
                        </span>

                        <strong>
                          {formatCurrency(
                            paymentDue
                          )}
                        </strong>
                      </div>

                      <label>
                        Tip
                      </label>

                      <select
                        value={
                          tipChoice
                        }
                        onChange={(
                          event
                        ) => {
                          const value =
                            event
                              .target
                              .value

                          setTipChoice(
                            value
                          )

                          if (
                            value !==
                            'custom'
                          ) {
                            const newTotal =
                              Number(
                                paymentDue ||
                                  0
                              ) +
                              Number(
                                paymentDue ||
                                  0
                              ) *
                                (Number(
                                  value
                                ) / 100)

                            setPaymentAmount(
                              formatMoneyInput(
                                newTotal
                              )
                            )
                          } else {
                            setPaymentAmount(
                              formatMoneyInput(
                                paymentDue
                              )
                            )
                          }

                          setPaymentError(
                            null
                          )

                          setPaymentMessage(
                            null
                          )
                        }}
                      >
                        <option value="0">
                          No tip
                        </option>

                        <option value="5">
                          5%
                        </option>

                        <option value="10">
                          10%
                        </option>

                        <option value="15">
                          15%
                        </option>

                        <option value="custom">
                          Custom amount
                        </option>
                      </select>

                      {tipChoice ===
                        'custom' && (
                        <div className="currency-input">
                          <span>
                            ₦
                          </span>

                          <input
                            type="text"
                            inputMode="decimal"
                            value={
                              customTip
                            }
                            onChange={(
                              event
                            ) => {
                              const formatted =
                                formatMoneyInput(
                                  event
                                    .target
                                    .value
                                )

                              setCustomTip(
                                formatted
                              )

                              const newTotal =
                                Number(
                                  paymentDue ||
                                    0
                                ) +
                                parseMoney(
                                  formatted
                                )

                              setPaymentAmount(
                                formatMoneyInput(
                                  newTotal
                                )
                              )

                              setPaymentError(
                                null
                              )

                              setPaymentMessage(
                                null
                              )
                            }}
                            placeholder="0.00"
                          />
                        </div>
                      )}

                      <div className="summary-row">
                        <span>
                          Tip amount
                        </span>

                        <strong>
                          {formatCurrency(
                            tipAmount
                          )}
                        </strong>
                      </div>

                      <div className="summary-row payment-grand-total">
                        <span>
                          Total to Pay
                        </span>

                        <strong>
                          {formatCurrency(
                            paymentTotal
                          )}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <label>
                    Payment Amount
                  </label>

                  <div className="currency-input">
                    <span>
                      ₦
                    </span>

                    <input
                      type="text"
                      inputMode="decimal"
                      value={
                        paymentAmount
                      }
                      onChange={(
                        event
                      ) =>
                        setPaymentAmount(
                          formatMoneyInput(
                            event
                              .target
                              .value
                          )
                        )
                      }
                      placeholder="7,800.00"
                    />
                  </div>

                  <button
                    className="primary-button"
                    onClick={
                      makePayment
                    }
                    disabled={
                      paymentLoading ||
                      paymentDue ===
                        null ||
                      paymentOrderStatus ===
                        'Paid'
                    }
                  >
                    {paymentOrderStatus ===
                    'Paid'
                      ? 'Order Already Paid'
                      : 'Make Pretend Payment'}
                  </button>

                  {paymentError && (
                    <div className="inline-feedback error">
                      {
                        paymentError
                      }
                    </div>
                  )}

                  {paymentSubmitted &&
                    paymentMessage && (
                      <div className="inline-feedback success">
                        {
                          paymentMessage
                        }
                      </div>
                    )}
                </>
              ) : (
                <div className="empty-payment">
                  Select one of your orders
                  to view its payment
                  breakdown.
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="waiter-dashboard">
          <section className="hero-card waiter-hero">
            <div>
              <span className="eyebrow">
                Staff workspace
              </span>

              <h2>
                Waiter Dashboard
              </h2>

              <p>
                Open orders, assign the
                correct preparation staff,
                track delays and mark orders
                as served.
              </p>
            </div>

            <div className="hero-stat">
              <span>
                Active waiters
              </span>

              <strong>
                {waiters.length}
              </strong>
            </div>
          </section>

          <div className="waiter-selection card-panel">
            <div>
              <span className="eyebrow">
                Your identity
              </span>

              <label>
                Select your name
              </label>
            </div>

            <select
              value={
                selectedWaiter
              }
              onChange={(event) => {
                setSelectedWaiter(
                  event.target.value
                )

                setSelectedOrder(
                  null
                )

                setStaffMessage(
                  null
                )

                setStaffError(
                  null
                )

                setServedMessage(
                  null
                )

                setServedError(
                  null
                )
              }}
            >
              <option value="">
                Select waiter
              </option>

              {waiters.map(
                (person) => (
                  <option
                    key={person.id}
                    value={person.id}
                  >
                    {formatStaffId(
                      person.id
                    )}{' '}
                    • {person.name}
                  </option>
                )
              )}
            </select>
          </div>

          {staffError && (
            <div className="inline-feedback error page-feedback">
              {staffError}
            </div>
          )}

          {!selectedWaiter ? (
            <div className="empty-state large-empty">
              <div className="empty-icon">
                W
              </div>

              <h3>
                Select a waiter
              </h3>

              <p>
                Choose your staff identity to
                view and handle orders.
              </p>
            </div>
          ) : orders.length ===
            0 ? (
            <div className="empty-state large-empty">
              <div className="empty-icon">
                ✓
              </div>

              <h3>
                No orders yet
              </h3>

              <p>
                New customer orders will
                appear here.
              </p>
            </div>
          ) : (
            <div className="orders">
              {orders.map(
                (order) => {
                  const overdue =
                    isOrderOverdue(
                      order
                    )

                  const delay =
                    Math.max(
                      Number(
                        order.delay_minutes ||
                          0
                      ),
                      getDelayMinutes(
                        order
                      )
                    )

                  return (
                    <div
                      className={`order-card ${
                        overdue
                          ? 'order-overdue'
                          : ''
                      }`}
                      key={order.id}
                    >
                      <div className="order-card-header">
                        <div>
                          <span className="eyebrow">
                            Order
                          </span>

                          <h3>
                            {formatOrderNumber(
                              order.id
                            )}
                          </h3>
                        </div>

                        <span
                          className={`status-badge status-${String(
                            order.status
                          ).toLowerCase()}`}
                        >
                          {
                            order.status
                          }
                        </span>
                      </div>

                      <div className="order-meta-grid">
                        <div>
                          <span>
                            Table
                          </span>

                          <strong>
                            {
                              order.table_number
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Customer
                          </span>

                          <strong>
                            {order.customer_code ||
                              'Legacy order'}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Wait
                          </span>

                          <strong>
                            {
                              order.waiting_time
                            }{' '}
                            min
                          </strong>
                        </div>
                      </div>

                      {overdue && (
                        <div className="delay-banner compact">
                          <strong>
                            Overdue by{' '}
                            {delay}{' '}
                            min
                          </strong>

                          <span>
                            Delay is being
                            recorded.
                          </span>
                        </div>
                      )}

                      {order.was_delayed &&
                        order.status !==
                          'Pending' && (
                          <div className="delay-record">
                            Delayed by{' '}
                            {
                              order.delay_minutes
                            }{' '}
                            min
                          </div>
                        )}

                      <button
                        className="secondary-button full-width"
                        onClick={() =>
                          openOrder(
                            order
                          )
                        }
                      >
                        Open Order
                      </button>

                      {selectedOrder &&
                        selectedOrder.id ===
                          order.id &&
                        staffMessage && (
                          <div className="inline-feedback success">
                            {
                              staffMessage
                            }
                          </div>
                        )}
                    </div>
                  )
                }
              )}
            </div>
          )}

          {selectedOrder && (
            <div className="order-details">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    Handling order
                  </span>

                  <h2>
                    {formatOrderNumber(
                      selectedOrder.id
                    )}
                  </h2>
                </div>

                <span
                  className={`status-badge status-${String(
                    selectedOrder.status
                  ).toLowerCase()}`}
                >
                  {
                    selectedOrder.status
                  }
                </span>
              </div>

              <div className="confirmation-grid">
                <div>
                  <span>
                    Customer ID
                  </span>

                  <strong>
                    {selectedOrder.customer_code ||
                      'Legacy order'}
                  </strong>
                </div>

                <div>
                  <span>
                    Table
                  </span>

                  <strong>
                    {
                      selectedOrder.table_number
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    Expected ready
                  </span>

                  <strong>
                    {formatDateTime(
                      selectedOrder.expected_ready_at
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Waiting time
                  </span>

                  <strong>
                    {
                      selectedOrder.waiting_time
                    }{' '}
                    min
                  </strong>
                </div>
              </div>

              {getDelayMinutes(
                selectedOrder
              ) > 0 &&
                selectedOrder.status ===
                  'Pending' && (
                  <div className="delay-banner">
                    <strong>
                      This order is overdue.
                    </strong>

                    <span>
                      It is currently{' '}
                      {getDelayMinutes(
                        selectedOrder
                      )}{' '}
                      minute
                      {getDelayMinutes(
                        selectedOrder
                      ) === 1
                        ? ''
                        : 's'}{' '}
                      past the estimated
                      ready time.
                    </span>
                  </div>
                )}

              <div className="assignment-section">
                <div>
                  <span className="eyebrow">
                    Preparation team
                  </span>

                  <h3>
                    Assign Staff
                  </h3>
                </div>

                <label>
                  Waiter
                </label>

                <input
                  type="text"
                  value={
                    waiters.find(
                      (person) =>
                        person.id ===
                        Number(
                          selectedWaiter
                        )
                    )
                      ? `${formatStaffId(
                          Number(
                            selectedWaiter
                          )
                        )} • ${
                          waiters.find(
                            (person) =>
                              person.id ===
                              Number(
                                selectedWaiter
                              )
                          )?.name
                        }`
                      : ''
                  }
                  readOnly
                />

                {orderNeedsChef && (
                  <>
                    <label>
                      Chef
                    </label>

                    <select
                      value={
                        selectedChef
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedChef(
                          event
                            .target
                            .value
                        )
                      }
                    >
                      <option value="">
                        Select chef
                      </option>

                      {chefs.map(
                        (person) => (
                          <option
                            key={
                              person.id
                            }
                            value={
                              person.id
                            }
                          >
                            {formatStaffId(
                              person.id
                            )}{' '}
                            •{' '}
                            {
                              person.name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </>
                )}

                {!orderNeedsChef && (
                  <div className="conditional-note">
                    No chef required —
                    this order contains
                    drinks only.
                  </div>
                )}

                {orderNeedsBartender && (
                  <>
                    <label>
                      Bartender
                    </label>

                    <select
                      value={
                        selectedBartender
                      }
                      onChange={(
                        event
                      ) =>
                        setSelectedBartender(
                          event
                            .target
                            .value
                        )
                      }
                    >
                      <option value="">
                        Select bartender
                      </option>

                      {bartenders.map(
                        (person) => (
                          <option
                            key={
                              person.id
                            }
                            value={
                              person.id
                            }
                          >
                            {formatStaffId(
                              person.id
                            )}{' '}
                            •{' '}
                            {
                              person.name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </>
                )}

                {!orderNeedsBartender && (
                  <div className="conditional-note">
                    No bartender required
                    — this order contains
                    food only.
                  </div>
                )}

                <button
                  className="primary-button full-width"
                  onClick={
                    assignStaff
                  }
                >
                  Save Staff Assignment
                </button>

                {staffError && (
                  <div className="inline-feedback error">
                    {staffError}
                  </div>
                )}

                {staffMessage && (
                  <div className="inline-feedback success">
                    {staffMessage}
                  </div>
                )}

                <button
                  className="serve-button"
                  onClick={
                    markServed
                  }
                  disabled={
                    selectedOrder.status ===
                      'Served' ||
                    selectedOrder.status ===
                      'Paid'
                  }
                >
                  {selectedOrder.status ===
                  'Served'
                    ? 'Order Served'
                    : selectedOrder.status ===
                      'Paid'
                      ? 'Order Paid'
                      : 'Mark as Served'}
                </button>

                {servedError && (
                  <div className="inline-feedback error">
                    {servedError}
                  </div>
                )}

                {servedMessage && (
                  <div className="inline-feedback success">
                    {
                      servedMessage
                    }
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

export default App