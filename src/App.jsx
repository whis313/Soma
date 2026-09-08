import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const CATEGORIES = [
  'All Offerings',
  'Starters / Small Chops',
  'Mains / Grills',
  'Woodfire Pizzas',
  'Cocktails / Cold Juices',
  'Desserts',
]

const TIP_OPTIONS = [0, 5, 10, 15]

function formatCurrency(value) {
  const amount = Number(value || 0)
  return `₦${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatWholeCurrency(value) {
  const amount = Number(value || 0)
  return `₦${amount.toLocaleString('en-NG')}`
}

function formatMoneyInput(value) {
  const digits = String(value ?? '').replace(/[^\d]/g, '')

  if (!digits) return ''

  return Number(digits).toLocaleString('en-NG')
}

function parseMoney(value) {
  const cleaned = String(value ?? '').replace(/[^\d.]/g, '')
  const amount = Number(cleaned)

  return Number.isFinite(amount) ? amount : 0
}

function formatDateTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatOrderNumber(orderId) {
  if (!orderId) return 'CHW-000000'

  const raw = String(orderId).replace(/\D/g, '')
  const shortCode = raw.slice(-6).padStart(6, '0')

  return `CHW-${shortCode}`
}

function formatStaffId(staffId) {
  if (!staffId) return 'STF-000000'

  const raw = String(staffId).replace(/\D/g, '')
  const shortCode = raw.slice(-6).padStart(6, '0')

  return `STF-${shortCode}`
}

function formatCustomerId(customerId) {
  if (!customerId) return 'CUS-000000'

  const raw = String(customerId).replace(/\D/g, '')
  const shortCode = raw.slice(-6).padStart(6, '0')

  return `CUS-${shortCode}`
}

function parseOrderId(displayValue) {
  if (!displayValue) return ''

  const value = String(displayValue).trim()

  if (/^\d+$/.test(value)) {
    return value
  }

  const numeric = value.replace(/\D/g, '')

  return numeric || value
}

function calculateSubtotal(items) {
  return items.reduce((sum, item) => {
    const price = Number(item.price || 0)
    const quantity = Number(item.quantity || 0)

    return sum + price * quantity
  }, 0)
}

function getDelayMinutes(order, comparisonTime) {
  if (!order?.expected_ready_at) {
    return Number(order?.delay_minutes || 0)
  }

  if (order.status === 'Paid') {
    return Number(order.delay_minutes || 0)
  }

  const expected = new Date(order.expected_ready_at).getTime()

  const comparison = order.served_at
    ? new Date(order.served_at).getTime()
    : comparisonTime.getTime()

  if (!Number.isFinite(expected) || comparison <= expected) {
    return Number(order.delay_minutes || 0)
  }

  return Math.max(
    Number(order.delay_minutes || 0),
    Math.floor((comparison - expected) / 60000),
  )
}

function isOrderOverdue(order, comparisonTime) {
  if (!order?.expected_ready_at) return false

  if (['Served', 'Paid'].includes(order.status)) {
    return Number(order.delay_minutes || 0) > 0
  }

  return new Date(order.expected_ready_at).getTime() < comparisonTime.getTime()
}

function getTrackingStage(order) {
  if (!order) return 1

  if (order.status === 'Served') return 4
  if (order.status === 'Paid') return 4
  if (order.waiter_id) return 2

  return 1
}

function getStatusLabel(order) {
  if (!order) return 'Confirmed'

  if (order.status === 'Served') return 'Served'
  if (order.status === 'Paid') return 'Paid'
  if (order.waiter_id) return 'Cooking'

  return 'Confirmed'
}

function getCategoryClass(category) {
  const value = String(category || '').toLowerCase()

  if (value.includes('starter')) return 'category-starter'
  if (value.includes('main')) return 'category-main'
  if (value.includes('pizza')) return 'category-pizza'
  if (value.includes('cocktail') || value.includes('juice')) {
    return 'category-drinks'
  }
  if (value.includes('dessert')) return 'category-dessert'

  return ''
}

function App() {
  const [role, setRole] = useState('customer')

  const [menuItems, setMenuItems] = useState([])
  const [staff, setStaff] = useState([])
  const [orders, setOrders] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])

  const [cart, setCart] = useState([])

  const [tableNumber, setTableNumber] = useState('Table 07')
  const [menuSearch, setMenuSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All Offerings')

  const [kitchenNotes, setKitchenNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [customerId, setCustomerId] = useState('')

  const [lastPlacedOrder, setLastPlacedOrder] = useState(null)

  const [feedbackOrderId, setFeedbackOrderId] = useState('')
  const [feedbackRating, setFeedbackRating] = useState('5')
  const [feedbackComment, setFeedbackComment] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  const [paymentOrderId, setPaymentOrderId] = useState('')
  const [paymentDue, setPaymentDue] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentAmountInput, setPaymentAmountInput] = useState('')
  const [selectedTip, setSelectedTip] = useState(0)
  const [paying, setPaying] = useState(false)

  const [selectedWaiterId, setSelectedWaiterId] = useState('')
  const [selectedChefId, setSelectedChefId] = useState('')
  const [selectedBartenderId, setSelectedBartenderId] = useState('')

  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false)

  const [orderFeedbackMessage, setOrderFeedbackMessage] = useState({})
  const [waiterCalled, setWaiterCalled] = useState(false)

  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 15000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let storedCustomerId = localStorage.getItem('chowly_customer_id')

    if (!storedCustomerId) {
      const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
      storedCustomerId = `CUS-${randomPart}`
      localStorage.setItem('chowly_customer_id', storedCustomerId)
    }

    setCustomerId(storedCustomerId)
  }, [])

  const loadMenu = useCallback(async () => {
    const { data, error: menuError } = await supabase
      .from('menu_items')
      .select('*')
      .order('id', { ascending: true })

    if (menuError) {
      throw menuError
    }

    setMenuItems(data || [])
  }, [])

  const loadStaff = useCallback(async () => {
    const { data, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .order('id', { ascending: true })

    if (staffError) {
      throw staffError
    }

    setStaff(data || [])
  }, [])

  const loadCustomerOrders = useCallback(async (activeCustomerId) => {
    if (!activeCustomerId) return

    const { data, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_code', activeCustomerId)
      .order('created_at', { ascending: false })

    if (orderError) {
      throw orderError
    }

    const rawOrders = data || []

    if (!rawOrders.length) {
      setCustomerOrders([])
      return
    }

    const orderIds = rawOrders.map((order) => order.id)

    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds)

    if (itemsError) {
      throw itemsError
    }

    const menuIds = [
      ...new Set(
        (orderItems || [])
          .map((item) => item.menu_item_id)
          .filter(Boolean),
      ),
    ]

    let menuLookup = {}

    if (menuIds.length) {
      const { data: menuData, error: lookupError } = await supabase
        .from('menu_items')
        .select('*')
        .in('id', menuIds)

      if (!lookupError) {
        menuLookup = Object.fromEntries(
          (menuData || []).map((item) => [String(item.id), item]),
        )
      }
    }

    const enrichedOrders = rawOrders.map((order) => ({
      ...order,
      items: (orderItems || [])
        .filter((item) => String(item.order_id) === String(order.id))
        .map((item) => ({
          ...item,
          menu_item: menuLookup[String(item.menu_item_id)] || null,
        })),
    }))

    setCustomerOrders(enrichedOrders)
  }, [])

  const loadOrders = useCallback(async () => {
    const { data, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })

    if (orderError) {
      throw orderError
    }

    const rawOrders = data || []

    if (!rawOrders.length) {
      setOrders([])
      return
    }

    const orderIds = rawOrders.map((order) => order.id)

    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .in('order_id', orderIds)

    if (itemsError) {
      throw itemsError
    }

    const menuIds = [
      ...new Set(
        (orderItems || [])
          .map((item) => item.menu_item_id)
          .filter(Boolean),
      ),
    ]

    let menuLookup = {}

    if (menuIds.length) {
      const { data: menuData, error: menuError } = await supabase
        .from('menu_items')
        .select('*')
        .in('id', menuIds)

      if (!menuError) {
        menuLookup = Object.fromEntries(
          (menuData || []).map((item) => [String(item.id), item]),
        )
      }
    }

    const enrichedOrders = rawOrders.map((order) => ({
      ...order,
      items: (orderItems || [])
        .filter((item) => String(item.order_id) === String(order.id))
        .map((item) => ({
          ...item,
          menu_item: menuLookup[String(item.menu_item_id)] || null,
        })),
    }))

    setOrders(enrichedOrders)
  }, [])

  const initialise = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      await Promise.all([
        loadMenu(),
        loadStaff(),
        loadOrders(),
      ])
    } catch (loadError) {
      console.error(loadError)
      setError(
        loadError?.message ||
          'Unable to load Chowly data. Please refresh and try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadMenu, loadOrders, loadStaff])

  useEffect(() => {
    initialise()
  }, [initialise])

  useEffect(() => {
    if (!customerId) return

    loadCustomerOrders(customerId).catch((loadError) => {
      console.error(loadError)
      setError(
        loadError?.message || 'Unable to load your previous orders.',
      )
    })
  }, [customerId, loadCustomerOrders])

  useEffect(() => {
    if (feedbackOrderId) {
      const belongsToCustomer = customerOrders.some(
        (order) => String(order.id) === String(feedbackOrderId),
      )

      if (!belongsToCustomer) {
        setFeedbackOrderId('')
      }
    }

    if (paymentOrderId) {
      const belongsToCustomer = customerOrders.some(
        (order) => String(order.id) === String(paymentOrderId),
      )

      if (!belongsToCustomer) {
        setPaymentOrderId('')
        setPaymentDue(null)
      }
    }
  }, [customerOrders, feedbackOrderId, paymentOrderId])

  const filteredMenuItems = menuItems.filter((item) => {
    const itemCategory = String(item.category || '').toLowerCase()
    const search = menuSearch.trim().toLowerCase()

    const matchesCategory =
      selectedCategory === 'All Offerings' ||
      itemCategory.includes(selectedCategory.toLowerCase()) ||
      selectedCategory
        .toLowerCase()
        .includes(itemCategory)

    const matchesSearch =
      !search ||
      String(item.name || '').toLowerCase().includes(search) ||
      itemCategory.includes(search) ||
      String(item.description || '').toLowerCase().includes(search)

    return matchesCategory && matchesSearch
  })

  const cartSubtotal = calculateSubtotal(cart)

  const tipAmount = Number(
    ((cartSubtotal * Number(selectedTip || 0)) / 100).toFixed(2),
  )

  const cartTotal = cartSubtotal + tipAmount

  const addToCart = (menuItem) => {
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => String(item.id) === String(menuItem.id),
      )

      if (existing) {
        return currentCart.map((item) =>
          String(item.id) === String(menuItem.id)
            ? {
                ...item,
                quantity: Number(item.quantity || 0) + 1,
              }
            : item,
        )
      }

      return [
        ...currentCart,
        {
          ...menuItem,
          quantity: 1,
        },
      ]
    })

    setMessage(`${menuItem.name} added to your order.`)
    setError('')
  }

  const updateCartQuantity = (menuItemId, direction) => {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (String(item.id) !== String(menuItemId)) {
            return item
          }

          const nextQuantity =
            Number(item.quantity || 0) + direction

          return {
            ...item,
            quantity: nextQuantity,
          }
        })
        .filter((item) => Number(item.quantity || 0) > 0),
    )
  }

  const removeFromCart = (menuItemId) => {
    setCart((currentCart) =>
      currentCart.filter(
        (item) => String(item.id) !== String(menuItemId),
      ),
    )
  }

  const getMaxPreparationMinutes = () => {
    if (!cart.length) return 0

    return Math.max(
      ...cart.map((item) => Number(item.preparation_time || 0)),
    )
  }

  const placeOrder = async () => {
    if (!customerId) {
      setError('Customer ID is still being generated. Please try again.')
      return
    }

    if (!cart.length) {
      setError('Add at least one item to your order first.')
      return
    }

    if (!tableNumber.trim()) {
      setError('Please enter your table number.')
      return
    }

    try {
      setPlacing(true)
      setMessage('')
      setError('')

      const maxPreparationMinutes = getMaxPreparationMinutes()

      const expectedReadyAt = new Date(
        Date.now() + maxPreparationMinutes * 60000,
      ).toISOString()

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          table_number: tableNumber.trim(),
          customer_code: customerId,
          status: 'Pending',
          total_amount: cartTotal,
          expected_ready_at: expectedReadyAt,
          delay_minutes: 0,
          was_delayed: false,
          kitchen_notes: kitchenNotes.trim() || null,
        })
        .select()
        .single()

      if (orderError) {
        throw orderError
      }

      const orderItemsPayload = cart.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price: Number(item.price || 0),
      }))

      const { error: orderItemsError } = await supabase
        .from('order_items')
        .insert(orderItemsPayload)

      if (orderItemsError) {
        await supabase
          .from('orders')
          .delete()
          .eq('id', order.id)

        throw orderItemsError
      }

      const savedOrder = {
        ...order,
        items: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          price: Number(item.price || 0),
          menu_item: item,
        })),
      }

      setLastPlacedOrder(savedOrder)
      setCart([])
      setKitchenNotes('')
      setMessage(
        `${formatOrderNumber(order.id)} placed successfully. Estimated preparation time: ${maxPreparationMinutes} minutes.`,
      )

      await Promise.all([
        loadCustomerOrders(customerId),
        loadOrders(),
      ])
    } catch (placeError) {
      console.error(placeError)

      setError(
        placeError?.message ||
          'Unable to place your order. Please try again.',
      )
    } finally {
      setPlacing(false)
    }
  }

  const getOrderById = (orderId) => {
    return customerOrders.find(
      (order) => String(order.id) === String(orderId),
    )
  }

  const loadPaymentDue = async (orderId) => {
    const parsedOrderId = parseOrderId(orderId)

    if (!parsedOrderId) {
      setPaymentDue(null)
      return
    }

    const belongsToCustomer = customerOrders.some(
      (order) => String(order.id) === String(parsedOrderId),
    )

    if (!belongsToCustomer) {
      setError('That order does not belong to this customer.')
      setPaymentDue(null)
      return
    }

    try {
      setPaymentLoading(true)
      setError('')
      setPaymentDue(null)

      const localOrder = getOrderById(parsedOrderId)

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', parsedOrderId)
        .eq('customer_code', customerId)
        .single()

      if (orderError) {
        throw orderError
      }

      const { data: orderItems, error: orderItemsError } =
        await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', parsedOrderId)

      if (orderItemsError) {
        throw orderItemsError
      }

      const menuIds = [
        ...new Set(
          (orderItems || [])
            .map((item) => item.menu_item_id)
            .filter(Boolean),
        ),
      ]

      let menuLookup = {}

      if (menuIds.length) {
        const { data: menuData, error: menuError } = await supabase
          .from('menu_items')
          .select('*')
          .in('id', menuIds)

        if (!menuError) {
          menuLookup = Object.fromEntries(
            (menuData || []).map((item) => [String(item.id), item]),
          )
        }
      }

      const items = (orderItems || []).map((item) => ({
        ...item,
        menu_item:
          menuLookup[String(item.menu_item_id)] || null,
      }))

      const baseAmount = Number(
        order.total_amount ??
          localOrder?.total_amount ??
          calculateSubtotal(
            items.map((item) => ({
              ...item,
              price: Number(item.price || item.menu_item?.price || 0),
            })),
          ),
      )

      setPaymentDue({
        ...order,
        items,
        amount: baseAmount,
      })

      setPaymentAmountInput(formatMoneyInput(baseAmount))
      setSelectedTip(0)
    } catch (paymentError) {
      console.error(paymentError)

      setError(
        paymentError?.message ||
          'Unable to load this order for payment.',
      )
    } finally {
      setPaymentLoading(false)
    }
  }

  const makePayment = async () => {
    if (!paymentDue?.id) {
      setError('Select an order to pay for.')
      return
    }

    const belongsToCustomer = customerOrders.some(
      (order) =>
        String(order.id) === String(paymentDue.id),
    )

    if (!belongsToCustomer) {
      setError('That order does not belong to this customer.')
      return
    }

    const enteredAmount = parseMoney(paymentAmountInput)
    const requiredAmount = Number(paymentDue.amount || 0)
    const finalTip = Number(
      ((requiredAmount * Number(selectedTip || 0)) / 100).toFixed(2),
    )
    const totalToPay = requiredAmount + finalTip

    if (enteredAmount < totalToPay) {
      setError(
        `Please enter at least ${formatCurrency(totalToPay)} to complete payment.`,
      )
      return
    }

    try {
      setPaying(true)
      setError('')
      setMessage('')

      const { data: existingPayments, error: existingError } =
        await supabase
          .from('payments')
          .select('*')
          .eq('order_id', paymentDue.id)
          .eq('status', 'Paid')

      if (existingError) {
        throw existingError
      }

      if (existingPayments?.length) {
        setError('This order has already been paid.')
        return
      }

      const { data: payment, error: paymentError } =
        await supabase
          .from('payments')
          .insert({
            order_id: paymentDue.id,
            amount: totalToPay,
            tip_amount: finalTip,
            payment_method: 'Pretend Payment',
            status: 'Paid',
            is_pretend: true,
          })
          .select()
          .single()

      if (paymentError) {
        throw paymentError
      }

      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          status: 'Paid',
        })
        .eq('id', paymentDue.id)
        .eq('customer_code', customerId)

      if (orderUpdateError) {
        await supabase
          .from('payments')
          .delete()
          .eq('id', payment.id)

        throw orderUpdateError
      }

      const updatedLastOrder =
        lastPlacedOrder &&
        String(lastPlacedOrder.id) === String(paymentDue.id)
          ? {
              ...lastPlacedOrder,
              status: 'Paid',
            }
          : lastPlacedOrder

      setLastPlacedOrder(updatedLastOrder)

      setCustomerOrders((currentOrders) =>
        currentOrders.map((order) =>
          String(order.id) === String(paymentDue.id)
            ? {
                ...order,
                status: 'Paid',
              }
            : order,
        ),
      )

      setPaymentDue((currentPaymentDue) =>
        currentPaymentDue
          ? {
              ...currentPaymentDue,
              status: 'Paid',
            }
          : currentPaymentDue,
      )

      setPaymentAmountInput('')
      setSelectedTip(0)

      setMessage(
        `${formatOrderNumber(paymentDue.id)} has been marked as Paid. This is a pretend/demo payment.`,
      )

      await Promise.all([
        loadCustomerOrders(customerId),
        loadOrders(),
      ])
    } catch (paymentError) {
      console.error(paymentError)

      setError(
        paymentError?.message ||
          'Unable to complete payment.',
      )
    } finally {
      setPaying(false)
    }
  }

  const assignStaff = async (orderId) => {
    if (!orderId) return

    try {
      setError('')

      const selectedOrder = orders.find(
        (order) => String(order.id) === String(orderId),
      )

      if (!selectedOrder) {
        setError('Order could not be found.')
        return
      }

      const updatePayload = {
        waiter_id: selectedWaiterId
          ? Number(selectedWaiterId)
          : null,
      }

      const orderItems = selectedOrder.items || []

      const needsChef = orderItems.some((item) => {
        const category = String(
          item.menu_item?.category || '',
        ).toLowerCase()

        return (
          category.includes('main') ||
          category.includes('pizza') ||
          category.includes('starter')
        )
      })

      const needsBartender = orderItems.some((item) => {
        const category = String(
          item.menu_item?.category || '',
        ).toLowerCase()

        return (
          category.includes('cocktail') ||
          category.includes('juice') ||
          category.includes('drink')
        )
      })

      if (needsChef) {
        updatePayload.chef_id = selectedChefId
          ? Number(selectedChefId)
          : null
      }

      if (needsBartender) {
        updatePayload.bartender_id = selectedBartenderId
          ? Number(selectedBartenderId)
          : null
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)

      if (updateError) {
        throw updateError
      }

      setOrderFeedbackMessage((current) => ({
        ...current,
        [orderId]: 'Staff assignment saved.',
      }))

      await Promise.all([
        loadOrders(),
        loadCustomerOrders(customerId),
      ])
    } catch (assignError) {
      console.error(assignError)

      setOrderFeedbackMessage((current) => ({
        ...current,
        [orderId]:
          assignError?.message ||
          'Unable to save staff assignment.',
      }))
    }
  }

  const openOrder = (orderId) => {
    const order = orders.find(
      (item) => String(item.id) === String(orderId),
    )

    if (!order) return

    setSelectedOrderId(orderId)
    setOrderDetailsOpen(true)

    setSelectedWaiterId(order.waiter_id ? String(order.waiter_id) : '')
    setSelectedChefId(order.chef_id ? String(order.chef_id) : '')
    setSelectedBartenderId(
      order.bartender_id ? String(order.bartender_id) : '',
    )

    setOrderFeedbackMessage({})
  }

  const markServed = async (orderId) => {
    try {
      setError('')

      const order = orders.find(
        (item) => String(item.id) === String(orderId),
      )

      if (!order) {
        setError('Order could not be found.')
        return
      }

      const servedAt = new Date().toISOString()

      let delayMinutes = Number(order.delay_minutes || 0)

      if (order.expected_ready_at) {
        const expected = new Date(order.expected_ready_at).getTime()
        const served = new Date(servedAt).getTime()

        if (
          Number.isFinite(expected) &&
          Number.isFinite(served) &&
          served > expected
        ) {
          delayMinutes = Math.max(
            delayMinutes,
            Math.floor((served - expected) / 60000),
          )
        }
      }

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'Served',
          served_at: servedAt,
          delay_minutes: delayMinutes,
          was_delayed: delayMinutes > 0,
          waiter_id: selectedWaiterId
            ? Number(selectedWaiterId)
            : order.waiter_id || null,
        })
        .eq('id', orderId)

      if (updateError) {
        throw updateError
      }

      setOrderFeedbackMessage((current) => ({
        ...current,
        [orderId]:
          delayMinutes > 0
            ? `Order served. Recorded delay: ${delayMinutes} minute${delayMinutes === 1 ? '' : 's'}.`
            : 'Order marked as served on time.',
      }))

      await Promise.all([
        loadOrders(),
        loadCustomerOrders(customerId),
      ])
    } catch (serveError) {
      console.error(serveError)

      setOrderFeedbackMessage((current) => ({
        ...current,
        [orderId]:
          serveError?.message ||
          'Unable to mark order as served.',
      }))
    }
  }

  const submitFeedback = async () => {
    const parsedOrderId = parseOrderId(feedbackOrderId)

    if (!parsedOrderId) {
      setError('Select an order before submitting feedback.')
      return
    }

    const belongsToCustomer = customerOrders.some(
      (order) => String(order.id) === String(parsedOrderId),
    )

    if (!belongsToCustomer) {
      setError('That order does not belong to this customer.')
      return
    }

    try {
      setSubmittingFeedback(true)
      setError('')
      setMessage('')

      const { error: feedbackError } = await supabase
        .from('feedback')
        .insert({
          order_id: parsedOrderId,
          rating: Number(feedbackRating),
          comment: feedbackComment.trim() || null,
        })

      if (feedbackError) {
        throw feedbackError
      }

      setMessage(
        'Thanks. Your feedback has been recorded successfully.',
      )

      setFeedbackComment('')
      setFeedbackRating('5')
    } catch (feedbackError) {
      console.error(feedbackError)

      setError(
        feedbackError?.message ||
          'Unable to submit feedback.',
      )
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const callWaiter = () => {
    setWaiterCalled(true)
    setMessage('A waiter has been notified.')

    window.setTimeout(() => {
      setWaiterCalled(false)
    }, 5000)
  }

  const syncOverdueOrders = async () => {
    try {
      const activeOrders = orders.filter(
        (order) =>
          !['Served', 'Paid'].includes(order.status) &&
          order.expected_ready_at,
      )

      for (const order of activeOrders) {
        const expectedTime = new Date(
          order.expected_ready_at,
        ).getTime()

        const now = new Date().getTime()

        if (
          Number.isFinite(expectedTime) &&
          now > expectedTime
        ) {
          const delayMinutes = Math.max(
            Number(order.delay_minutes || 0),
            Math.floor((now - expectedTime) / 60000),
          )

          if (delayMinutes > Number(order.delay_minutes || 0)) {
            await supabase
              .from('orders')
              .update({
                delay_minutes: delayMinutes,
                was_delayed: true,
              })
              .eq('id', order.id)
          }
        }
      }

      await loadOrders()
    } catch (syncError) {
      console.error(syncError)
    }
  }

  const selectedOrder = orders.find(
    (order) => String(order.id) === String(selectedOrderId),
  )

  const orderNeedsChef = selectedOrder?.items?.some((item) => {
    const category = String(
      item.menu_item?.category || '',
    ).toLowerCase()

    return (
      category.includes('main') ||
      category.includes('pizza') ||
      category.includes('starter')
    )
  })

  const orderNeedsBartender = selectedOrder?.items?.some((item) => {
    const category = String(
      item.menu_item?.category || '',
    ).toLowerCase()

    return (
      category.includes('cocktail') ||
      category.includes('juice') ||
      category.includes('drink')
    )
  })

  const activeOrders = orders.filter(
    (order) =>
      !['Served', 'Paid'].includes(order.status),
  )

  const overdueOrders = orders.filter((order) =>
    isOrderOverdue(order, currentTime),
  )

  const servedOrders = orders.filter(
    (order) => order.status === 'Served',
  )

  const averageWait =
    servedOrders.length > 0
      ? Math.round(
          servedOrders.reduce(
            (sum, order) =>
              sum + Number(order.delay_minutes || 0),
            0,
          ) / servedOrders.length,
        )
      : 0

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="brand-row">
            <div className="brand-mark">C</div>

            <div>
              <div className="brand-name">Chowly</div>
              <div className="brand-subtitle">
                Restaurant ordering
              </div>
            </div>
          </div>

          <div className="identity-badge">
            <strong>Table 07</strong>
            <span>•</span>
            <span>{formatCustomerId(customerId)}</span>
          </div>
        </div>

        <div className="role-switch">
          <button
            className={
              role === 'customer'
                ? 'role-button active-role'
                : 'role-button'
            }
            onClick={() => {
              setRole('customer')
              setMessage('')
              setError('')
            }}
          >
            Customer
          </button>

          <button
            className={
              role === 'waiter'
                ? 'role-button active-role'
                : 'role-button'
            }
            onClick={() => {
              setRole('waiter')
              setMessage('')
              setError('')
              syncOverdueOrders()
            }}
          >
            Waiter
          </button>
        </div>
      </header>

      {error && (
        <div className="global-alert error-alert">
          <span>{error}</span>

          <button onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      {message && (
        <div className="global-alert success-alert">
          <span>{message}</span>

          <button onClick={() => setMessage('')}>
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <main className="loading-state">
          <div className="loading-spinner" />
          <p>Loading Chowly...</p>
        </main>
      ) : role === 'customer' ? (
        <main className="page">
          <section className="hero-card">
            <div className="hero-copy">
              <div className="eyebrow">LIVE DINING</div>

              <h1>
                Welcome to Chowly.
                <br />
                Your table is ready.
              </h1>

              <p>
                Browse the menu, place your order, track
                preparation, and pay before you leave.
              </p>

              <div className="hero-meta">
                <span>
                  <strong>{tableNumber}</strong>
                </span>

                <span>
                  <strong>{formatCustomerId(customerId)}</strong>
                </span>
              </div>
            </div>

            <div className="hero-actions">
              <button
                className="primary-button"
                onClick={() =>
                  document
                    .getElementById('menu')
                    ?.scrollIntoView({
                      behavior: 'smooth',
                    })
                }
              >
                Track Order
              </button>

              <button
                className="secondary-button"
                onClick={callWaiter}
              >
                {waiterCalled
                  ? 'Waiter Called'
                  : 'Call Waiter'}
              </button>
            </div>
          </section>

          <div className="customer-layout">
            <section className="menu-section" id="menu">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    CHOWLY MENU
                  </div>

                  <h2>Choose your favourites</h2>
                </div>

                <div className="item-count">
                  {filteredMenuItems.length} item
                  {filteredMenuItems.length === 1
                    ? ''
                    : 's'}
                </div>
              </div>

              <div className="menu-search">
                <span>⌕</span>

                <input
                  type="text"
                  value={menuSearch}
                  onChange={(event) =>
                    setMenuSearch(event.target.value)
                  }
                  placeholder="Search food, drinks, desserts..."
                />
              </div>

              <div className="category-tabs">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    className={
                      selectedCategory === category
                        ? 'category-tab active-category'
                        : 'category-tab'
                    }
                    onClick={() =>
                      setSelectedCategory(category)
                    }
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="menu">
                {filteredMenuItems.length === 0 ? (
                  <div className="empty-state">
                    <h3>No menu items found</h3>
                    <p>
                      Try another search or category.
                    </p>
                  </div>
                ) : (
                  filteredMenuItems.map((item) => (
                    <article
                      className="menu-card"
                      key={item.id}
                    >
                      <div className="menu-card-content">
                        <div className="menu-card-top">
                          <div>
                            <span
                              className={`category-pill ${getCategoryClass(
                                item.category,
                              )}`}
                            >
                              {item.category ||
                                'Menu Item'}
                            </span>

                            <h3>{item.name}</h3>
                          </div>

                          <span className="prep-pill">
                            {Number(
                              item.preparation_time || 0,
                            )}{' '}
                            min
                          </span>
                        </div>

                        {item.description && (
                          <p className="menu-description">
                            {item.description}
                          </p>
                        )}

                        <div className="menu-card-footer">
                          <strong>
                            {formatWholeCurrency(
                              item.price,
                            )}
                          </strong>

                          <button
                            className="add-button"
                            onClick={() =>
                              addToCart(item)
                            }
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <aside className="cart">
              <div className="section-heading cart-heading">
                <div>
                  <div className="eyebrow">
                    YOUR ORDER
                  </div>
                  <h2>Table 07</h2>
                </div>

                <div className="cart-count">
                  {cart.reduce(
                    (sum, item) =>
                      sum + Number(item.quantity || 0),
                    0,
                  )}
                </div>
              </div>

              <label className="field-label">
                Table number
              </label>

              <input
                className="text-input"
                value={tableNumber}
                onChange={(event) =>
                  setTableNumber(event.target.value)
                }
                placeholder="e.g. Table 07"
              />

              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="empty-icon">+</div>
                  <h3>Your order is empty</h3>
                  <p>
                    Add dishes and drinks from the menu
                    to get started.
                  </p>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map((item) => (
                      <div
                        className="cart-item"
                        key={item.id}
                      >
                        <div className="cart-item-main">
                          <strong>
                            {item.name}
                          </strong>

                          <span>
                            {formatCurrency(item.price)}
                          </span>
                        </div>

                        <div className="cart-item-bottom">
                          <div className="quantity-control">
                            <button
                              onClick={() =>
                                updateCartQuantity(
                                  item.id,
                                  -1,
                                )
                              }
                            >
                              −
                            </button>

                            <span>
                              {item.quantity}
                            </span>

                            <button
                              onClick={() =>
                                updateCartQuantity(
                                  item.id,
                                  1,
                                )
                              }
                            >
                              +
                            </button>
                          </div>

                          <strong>
                            {formatCurrency(
                              Number(item.price || 0) *
                                Number(
                                  item.quantity || 0,
                                ),
                            )}
                          </strong>
                        </div>

                        <button
                          className="remove-item-button"
                          onClick={() =>
                            removeFromCart(item.id)
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="cart-section">
                    <label className="field-label">
                      Kitchen instructions
                    </label>

                    <textarea
                      value={kitchenNotes}
                      onChange={(event) =>
                        setKitchenNotes(
                          event.target.value,
                        )
                      }
                      placeholder="Anything the kitchen should know?"
                      rows={3}
                    />
                  </div>

                  <div className="cart-section">
                    <label className="field-label">
                      Tip your service team
                    </label>

                    <div className="tip-selector">
                      {TIP_OPTIONS.map((tip) => (
                        <button
                          key={tip}
                          className={
                            selectedTip === tip
                              ? 'tip-button active-tip'
                              : 'tip-button'
                          }
                          onClick={() =>
                            setSelectedTip(tip)
                          }
                        >
                          {tip}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="summary">
                    <div>
                      <span>Subtotal</span>
                      <strong>
                        {formatCurrency(
                          cartSubtotal,
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Tip</span>
                      <strong>
                        {formatCurrency(tipAmount)}
                      </strong>
                    </div>

                    <div>
                      <span>Estimated preparation</span>
                      <strong>
                        {getMaxPreparationMinutes()} min
                      </strong>
                    </div>

                    <div className="total-row">
                      <span>Total</span>
                      <strong>
                        {formatCurrency(cartTotal)}
                      </strong>
                    </div>
                  </div>

                  <button
                    className="primary-button full-width"
                    onClick={placeOrder}
                    disabled={placing}
                  >
                    {placing
                      ? 'Placing order...'
                      : `Place Order · ${formatCurrency(
                          cartTotal,
                        )}`}
                  </button>
                </>
              )}
            </aside>
          </div>

          {lastPlacedOrder && (
            <section className="order-success-card">
              <div className="success-check">✓</div>

              <div>
                <div className="eyebrow">
                  ORDER CONFIRMED
                </div>

                <h3>
                  {formatOrderNumber(
                    lastPlacedOrder.id,
                  )}
                </h3>

                <p>
                  Your order was sent to the restaurant.
                  Estimated preparation time:{' '}
                  <strong>
                    {Math.max(
                      0,
                      Number(
                        lastPlacedOrder.expected_ready_at
                          ? Math.round(
                              (
                                new Date(
                                  lastPlacedOrder.expected_ready_at,
                                ).getTime() -
                                new Date(
                                  lastPlacedOrder.created_at,
                                ).getTime()
                              ) / 60000,
                            )
                          : 0,
                      ),
                    )}{' '}
                    minutes.
                  </strong>
                </p>
              </div>
            </section>
          )}

          {customerOrders.length > 0 && (
            <section className="order-confirmation">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    ORDER TRACKING
                  </div>

                  <h2>Your recent orders</h2>
                </div>
              </div>

              <div className="confirmation-grid">
                {customerOrders.slice(0, 5).map((order) => {
                  const trackingStage =
                    getTrackingStage(order)

                  const delayMinutes =
                    getDelayMinutes(
                      order,
                      currentTime,
                    )

                  return (
                    <article
                      className="confirmation-card"
                      key={order.id}
                    >
                      <div className="confirmation-card-header">
                        <div>
                          <span className="eyebrow">
                            ORDER
                          </span>

                          <h3>
                            {formatOrderNumber(
                              order.id,
                            )}
                          </h3>
                        </div>

                        <span
                          className={`status-badge status-${String(
                            order.status || 'Pending',
                          ).toLowerCase()}`}
                        >
                          {getStatusLabel(order)}
                        </span>
                      </div>

                      <div className="tracking">
                        {[
                          'Confirmed',
                          'Cooking',
                          'Ready',
                          'Served',
                        ].map((stage, index) => (
                          <div
                            className={
                              trackingStage >= index + 1
                                ? 'tracking-step active-tracking-step'
                                : 'tracking-step'
                            }
                            key={stage}
                          >
                            <div className="tracking-circle">
                              {index + 1}
                            </div>

                            <span>{stage}</span>
                          </div>
                        ))}
                      </div>

                      <div className="confirmation-items">
                        {(order.items || []).map(
                          (item, index) => (
                            <div
                              className="confirmation-item"
                              key={`${order.id}-${index}`}
                            >
                              <span>
                                {item.quantity} ×{' '}
                                {item.menu_item?.name ||
                                  'Menu item'}
                              </span>

                              <strong>
                                {formatCurrency(
                                  Number(
                                    item.price ||
                                      item.menu_item
                                        ?.price ||
                                      0,
                                  ) *
                                    Number(
                                      item.quantity ||
                                        0,
                                    ),
                                )}
                              </strong>
                            </div>
                          ),
                        )}
                      </div>

                      <div className="confirmation-footer">
                        <div>
                          <span>Placed</span>
                          <strong>
                            {formatDateTime(
                              order.created_at,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>Total</span>
                          <strong>
                            {formatCurrency(
                              order.total_amount,
                            )}
                          </strong>
                        </div>
                      </div>

                      {delayMinutes > 0 && (
                        <div className="delay-record">
                          Delayed by {delayMinutes}{' '}
                          minute
                          {delayMinutes === 1
                            ? ''
                            : 's'}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <section className="customer-actions">
            <div className="action-card">
              <div>
                <div className="eyebrow">
                  FEEDBACK
                </div>

                <h3>Tell us about your experience</h3>

                <p>
                  Rate an order and leave a complaint or
                  comment.
                </p>
              </div>

              <div className="action-form">
                <select
                  value={feedbackOrderId}
                  onChange={(event) =>
                    setFeedbackOrderId(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select your order
                  </option>

                  {customerOrders.map((order) => (
                    <option
                      key={order.id}
                      value={order.id}
                    >
                      {formatOrderNumber(
                        order.id,
                      )}{' '}
                      ·{' '}
                      {formatCurrency(
                        order.total_amount,
                      )}
                    </option>
                  ))}
                </select>

                <select
                  value={feedbackRating}
                  onChange={(event) =>
                    setFeedbackRating(
                      event.target.value,
                    )
                  }
                >
                  <option value="5">5 — Excellent</option>
                  <option value="4">4 — Good</option>
                  <option value="3">3 — Okay</option>
                  <option value="2">2 — Poor</option>
                  <option value="1">
                    1 — Very poor
                  </option>
                </select>

                <textarea
                  value={feedbackComment}
                  onChange={(event) =>
                    setFeedbackComment(
                      event.target.value,
                    )
                  }
                  rows={3}
                  placeholder="Complaint, compliment, or suggestion"
                />

                <button
                  className="secondary-button"
                  onClick={submitFeedback}
                  disabled={submittingFeedback}
                >
                  {submittingFeedback
                    ? 'Submitting...'
                    : 'Submit Feedback'}
                </button>
              </div>
            </div>

            <div className="action-card">
              <div>
                <div className="eyebrow">
                  PAYMENT
                </div>

                <h3>Settle your bill</h3>

                <p>
                  Payments are processed through the
                  Chowly demo flow.
                </p>
              </div>

              <div className="action-form">
                <select
                  value={paymentOrderId}
                  onChange={async (event) => {
                    const value =
                      event.target.value

                    setPaymentOrderId(value)

                    if (value) {
                      await loadPaymentDue(value)
                    } else {
                      setPaymentDue(null)
                    }
                  }}
                >
                  <option value="">
                    Select your order
                  </option>

                  {customerOrders.map((order) => (
                    <option
                      key={order.id}
                      value={order.id}
                    >
                      {formatOrderNumber(
                        order.id,
                      )}{' '}
                      ·{' '}
                      {order.status === 'Paid'
                        ? 'Paid'
                        : formatCurrency(
                            order.total_amount,
                          )}
                    </option>
                  ))}
                </select>

                {paymentLoading && (
                  <div className="inline-feedback">
                    Loading payment details...
                  </div>
                )}

                {paymentDue && (
                  <div className="payment-breakdown">
                    <div className="payment-title">
                      <span>
                        {formatOrderNumber(
                          paymentDue.id,
                        )}
                      </span>

                      <strong>
                        {paymentDue.status ===
                        'Paid'
                          ? 'PAID'
                          : 'UNPAID'}
                      </strong>
                    </div>

                    {paymentDue.items?.map(
                      (item, index) => {
                        const unitPrice = Number(
                          item.price ||
                            item.menu_item?.price ||
                            0,
                        )

                        const quantity = Number(
                          item.quantity || 0,
                        )

                        return (
                          <div
                            className="payment-line"
                            key={`${paymentDue.id}-${index}`}
                          >
                            <span>
                              {quantity} ×{' '}
                              {item.menu_item?.name ||
                                'Menu item'}
                            </span>

                            <strong>
                              {formatCurrency(
                                unitPrice *
                                  quantity,
                              )}
                            </strong>
                          </div>
                        )
                      },
                    )}

                    <div className="payment-divider" />

                    <div className="payment-line">
                      <span>Order total</span>

                      <strong>
                        {formatCurrency(
                          paymentDue.amount,
                        )}
                      </strong>
                    </div>

                    <div className="tip-selector">
                      {TIP_OPTIONS.map((tip) => (
                        <button
                          key={tip}
                          className={
                            selectedTip === tip
                              ? 'tip-button active-tip'
                              : 'tip-button'
                          }
                          onClick={() =>
                            setSelectedTip(tip)
                          }
                          disabled={
                            paymentDue.status ===
                            'Paid'
                          }
                        >
                          {tip}%
                        </button>
                      ))}
                    </div>

                    <label className="field-label">
                      Amount paid
                    </label>

                    <div className="currency-input">
                      <span>₦</span>

                      <input
                        value={paymentAmountInput}
                        onChange={(event) =>
                          setPaymentAmountInput(
                            formatMoneyInput(
                              event.target
                                .value,
                            ),
                          )
                        }
                        placeholder="0"
                        disabled={
                          paymentDue.status === 'Paid'
                        }
                      />
                    </div>

                    <div className="payment-total">
                      <span>Total due</span>

                      <strong>
                        {formatCurrency(
                          Number(
                            paymentDue.amount || 0,
                          ) +
                            Number(
                              (
                                (Number(
                                  paymentDue.amount ||
                                    0,
                                ) *
                                  Number(
                                    selectedTip || 0,
                                  )) /
                                100
                              ).toFixed(2),
                            ),
                        )}
                      </strong>
                    </div>

                    <button
                      className="primary-button full-width"
                      onClick={makePayment}
                      disabled={
                        paying ||
                        paymentDue.status === 'Paid'
                      }
                    >
                      {paymentDue.status === 'Paid'
                        ? 'Payment Complete'
                        : paying
                          ? 'Processing...'
                          : 'Pay Now'}
                    </button>

                    <p className="payment-note">
                      Demo / pretend payment only.
                      No real card is charged.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="page">
          <section className="hero-card waiter-hero">
            <div className="hero-copy">
              <div className="eyebrow">STAFF MODE</div>

              <h1>
                Service control.
                <br />
                Keep every table moving.
              </h1>

              <p>
                Assign the right staff, monitor delays,
                and mark orders served.
              </p>
            </div>

            <div className="hero-actions">
              <button
                className="secondary-button"
                onClick={syncOverdueOrders}
              >
                Refresh Orders
              </button>
            </div>
          </section>

          <section className="staff-metrics">
            <div className="metric-card">
              <span>Active Orders</span>
              <strong>{activeOrders.length}</strong>
            </div>

            <div className="metric-card">
              <span>Overdue</span>
              <strong>{overdueOrders.length}</strong>
            </div>

            <div className="metric-card">
              <span>Service Volume</span>
              <strong>{servedOrders.length}</strong>
            </div>

            <div className="metric-card">
              <span>Avg. Delay</span>
              <strong>{averageWait} min</strong>
            </div>
          </section>

          <section className="waiter-dashboard">
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  SERVICE QUEUE
                </div>

                <h2>Live orders</h2>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="empty-state">
                <h3>No orders yet</h3>
                <p>
                  Customer orders will appear here
                  automatically.
                </p>
              </div>
            ) : (
              <div className="orders">
                {orders.map((order) => {
                  const delayMinutes =
                    getDelayMinutes(
                      order,
                      currentTime,
                    )

                  const overdue =
                    isOrderOverdue(
                      order,
                      currentTime,
                    )

                  return (
                    <article
                      className="order-card"
                      key={order.id}
                    >
                      <div className="order-card-header">
                        <div>
                          <span className="eyebrow">
                            TABLE
                          </span>

                          <h3>
                            {order.table_number ||
                              'Table'}
                          </h3>

                          <div className="order-meta">
                            {formatOrderNumber(
                              order.id,
                            )}{' '}
                            ·{' '}
                            {formatDateTime(
                              order.created_at,
                            )}
                          </div>
                        </div>

                        <span
                          className={
                            overdue
                              ? 'status-badge order-overdue'
                              : `status-badge status-${String(
                                  order.status ||
                                    'Pending',
                                ).toLowerCase()}`
                          }
                        >
                          {overdue
                            ? 'Overdue'
                            : getStatusLabel(order)}
                        </span>
                      </div>

                      <div className="order-meta-grid">
                        <div>
                          <span>Customer</span>
                          <strong>
                            {formatCustomerId(
                              order.customer_code,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>Total</span>
                          <strong>
                            {formatCurrency(
                              order.total_amount,
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>Expected</span>
                          <strong>
                            {formatDateTime(
                              order.expected_ready_at,
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="order-card-items">
                        {(order.items || []).map(
                          (item, index) => (
                            <div
                              className="order-ticket-item"
                              key={`${order.id}-${index}`}
                            >
                              <span>
                                <strong>
                                  {item.quantity}×
                                </strong>{' '}
                                {item.menu_item?.name ||
                                  'Menu item'}
                              </span>

                              <strong>
                                {formatCurrency(
                                  Number(
                                    item.price ||
                                      item.menu_item
                                        ?.price ||
                                      0,
                                  ) *
                                    Number(
                                      item.quantity ||
                                        0,
                                    ),
                                )}
                              </strong>
                            </div>
                          ),
                        )}
                      </div>

                      {order.kitchen_notes && (
                        <div className="kitchen-note">
                          <span>Kitchen note</span>
                          <strong>
                            {order.kitchen_notes}
                          </strong>
                        </div>
                      )}

                      {delayMinutes > 0 && (
                        <div className="delay-banner">
                          Service delay:{' '}
                          <strong>
                            {delayMinutes} minute
                            {delayMinutes === 1
                              ? ''
                              : 's'}
                          </strong>
                        </div>
                      )}

                      <div className="order-details">
                        <button
                          className="secondary-button"
                          onClick={() =>
                            openOrder(order.id)
                          }
                        >
                          Assign Staff
                        </button>

                        <button
                          className="serve-button"
                          onClick={() =>
                            markServed(order.id)
                          }
                          disabled={
                            order.status === 'Served'
                          }
                        >
                          {order.status === 'Served'
                            ? 'Served'
                            : 'Mark Served'}
                        </button>
                      </div>

                      {orderFeedbackMessage[
                        order.id
                      ] && (
                        <div className="inline-feedback">
                          {
                            orderFeedbackMessage[
                              order.id
                            ]
                          }
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {orderDetailsOpen &&
            selectedOrder && (
              <div className="modal-backdrop">
                <div className="modal-card">
                  <button
                    className="modal-close"
                    onClick={() =>
                      setOrderDetailsOpen(false)
                    }
                  >
                    ×
                  </button>

                  <div className="eyebrow">
                    ORDER DETAILS
                  </div>

                  <h2>
                    {formatOrderNumber(
                      selectedOrder.id,
                    )}
                  </h2>

                  <p className="modal-description">
                    Assign staff according to the items
                    in this order.
                  </p>

                  <div className="assignment-section">
                    <label className="field-label">
                      Waiter
                    </label>

                    <select
                      value={selectedWaiterId}
                      onChange={(event) =>
                        setSelectedWaiterId(
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        Select waiter
                      </option>

                      {staff
                        .filter(
                          (member) =>
                            String(
                              member.role || '',
                            ).toLowerCase() ===
                            'waiter',
                        )
                        .map((member) => (
                          <option
                            key={member.id}
                            value={member.id}
                          >
                            {member.name} ·{' '}
                            {formatStaffId(
                              member.id,
                            )}
                          </option>
                        ))}
                    </select>
                  </div>

                  {orderNeedsChef && (
                    <div className="assignment-section">
                      <label className="field-label">
                        Chef
                      </label>

                      <select
                        value={selectedChefId}
                        onChange={(event) =>
                          setSelectedChefId(
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          Select chef
                        </option>

                        {staff
                          .filter(
                            (member) =>
                              String(
                                member.role || '',
                              ).toLowerCase() ===
                              'chef',
                          )
                          .map((member) => (
                            <option
                              key={member.id}
                              value={member.id}
                            >
                              {member.name} ·{' '}
                              {formatStaffId(
                                member.id,
                              )}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {orderNeedsBartender && (
                    <div className="assignment-section">
                      <label className="field-label">
                        Bartender
                      </label>

                      <select
                        value={selectedBartenderId}
                        onChange={(event) =>
                          setSelectedBartenderId(
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          Select bartender
                        </option>

                        {staff
                          .filter(
                            (member) =>
                              String(
                                member.role || '',
                              ).toLowerCase() ===
                              'bartender',
                          )
                          .map((member) => (
                            <option
                              key={member.id}
                              value={member.id}
                            >
                              {member.name} ·{' '}
                              {formatStaffId(
                                member.id,
                              )}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {!orderNeedsChef &&
                    !orderNeedsBartender && (
                      <div className="inline-feedback">
                        This order only requires waiter
                        service.
                      </div>
                    )}

                  <div className="modal-actions">
                    <button
                      className="secondary-button"
                      onClick={() =>
                        setOrderDetailsOpen(false)
                      }
                    >
                      Cancel
                    </button>

                    <button
                      className="primary-button"
                      onClick={async () => {
                        await assignStaff(
                          selectedOrder.id,
                        )

                        setOrderDetailsOpen(false)
                      }}
                    >
                      Save Assignment
                    </button>
                  </div>
                </div>
              </div>
            )}
        </main>
      )}
    </div>
  )
}

export default App